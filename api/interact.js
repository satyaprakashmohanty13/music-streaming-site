// api/interact.js
const { createClient } = require('@supabase/supabase-js');

// IMPORTANT: Set these environment variables in your Vercel project settings
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY (This key bypasses RLS, so handle with care!)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase client with the service role key for backend operations
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'GET') {
        // Handle GET request to fetch interaction counts
        const { songPublicId, userId } = req.query;

        try {
            if (songPublicId) {
                // Fetch counts for a specific song
                const { data: likesData, error: likesError } = await supabase
                    .from('song_interactions')
                    .select('id', { count: 'exact' })
                    .eq('song_public_id', songPublicId)
                    .eq('interaction_type', 'like');

                const { data: dislikesData, error: dislikesError } = await supabase
                    .from('song_interactions')
                    .select('id', { count: 'exact' })
                    .eq('song_public_id', songPublicId)
                    .eq('interaction_type', 'dislike');

                if (likesError || dislikesError) {
                    console.error('Supabase fetch error:', likesError || dislikesError);
                    return res.status(500).json({ error: 'Failed to fetch interaction counts' });
                }

                res.status(200).json({
                    likes: likesData.length,
                    dislikes: dislikesData.length
                });
            } else if (userId) {
                // Fetch all interactions for a specific user
                const { data, error } = await supabase
                    .from('song_interactions')
                    .select('song_public_id, interaction_type')
                    .eq('user_id', userId);

                if (error) {
                    console.error('Supabase fetch user interactions error:', error);
                    return res.status(500).json({ error: 'Failed to fetch user interactions' });
                }
                res.status(200).json(data);
            } else {
                return res.status(400).json({ error: 'Missing songPublicId or userId parameter for GET request' });
            }

        } catch (error) {
            console.error('Server error during GET request:', error);
            res.status(500).json({ error: 'Internal server error' });
        }

    } else if (req.method === 'POST') {
        // Handle POST request for like/dislike action
        const { songPublicId, userId, action } = req.body;

        if (!songPublicId || !userId || !action) {
            return res.status(400).json({ error: 'Missing songPublicId, userId, or action' });
        }

        if (action !== 'like' && action !== 'dislike') {
            return res.status(400).json({ error: 'Invalid action. Must be "like" or "dislike".' });
        }

        try {
            // Check if user has already interacted with this song
            const { data: existingInteraction, error: fetchError } = await supabase
                .from('song_interactions')
                .select('*')
                .eq('song_public_id', songPublicId)
                .eq('user_id', userId)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means "no rows found"
                console.error('Supabase fetch existing interaction error:', fetchError);
                throw fetchError;
            }

            let responseData = {};

            if (existingInteraction) {
                // User has already interacted
                if (existingInteraction.interaction_type === action) {
                    // If the same action, do nothing (user clicks like on an already liked song)
                    console.log(`User ${userId} already ${action}d song ${songPublicId}. No change.`);
                } else {
                    // If different action (e.g., changing from like to dislike, or vice-versa)
                    const { error: updateError } = await supabase
                        .from('song_interactions')
                        .update({ interaction_type: action })
                        .eq('id', existingInteraction.id);

                    if (updateError) {
                        console.error('Supabase update error:', updateError);
                        throw updateError;
                    }
                    console.log(`User ${userId} changed interaction for song ${songPublicId} to ${action}.`);
                }
            } else {
                // No existing interaction, insert new one
                const { error: insertError } = await supabase
                    .from('song_interactions')
                    .insert({
                        song_public_id: songPublicId,
                        user_id: userId,
                        interaction_type: action
                    });

                if (insertError) {
                    console.error('Supabase insert error:', insertError);
                    // Check for unique constraint violation (user already liked/disliked but somehow existingInteraction was null)
                    if (insertError.code === '23505') { // PostgreSQL unique violation error code
                        console.warn(`Unique constraint violated for user ${userId} and song ${songPublicId}. This should ideally not happen if existingInteraction check is robust.`);
                        // Treat as no change, as the interaction already exists
                    } else {
                        throw insertError;
                    }
                } else {
                    console.log(`User ${userId} ${action}d song ${songPublicId}.`);
                }
            }

            // After insert/update, fetch and return the latest counts for the song
            const { data: likesData, error: likesError } = await supabase
                .from('song_interactions')
                .select('id', { count: 'exact' })
                .eq('song_public_id', songPublicId)
                .eq('interaction_type', 'like');

            const { data: dislikesData, error: dislikesError } = await supabase
                .from('song_interactions')
                .select('id', { count: 'exact' })
                .eq('song_public_id', songPublicId)
                .eq('interaction_type', 'dislike');

            if (likesError || dislikesError) {
                console.error('Supabase fetch counts after interaction error:', likesError || dislikesError);
                throw likesError || dislikesError;
            }

            res.status(200).json({
                likes: likesData.length,
                dislikes: dislikesData.length
            });

        } catch (error) {
            console.error('Server error during POST request:', error);
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }

    } else {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
};

