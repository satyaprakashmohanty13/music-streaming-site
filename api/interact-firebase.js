// api/interact-firebase.js
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
// This uses environment variables set in Vercel
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newlines correctly
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
    });
}

const db = admin.firestore();

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
        // Handle GET request to fetch interaction counts or user's interactions
        const { songPublicId, userId } = req.query;

        try {
            if (songPublicId) {
                // Fetch counts for a specific song
                const likesSnapshot = await db.collection('song_interactions')
                    .where('song_public_id', '==', songPublicId)
                    .where('interaction_type', '==', 'like')
                    .get();

                const dislikesSnapshot = await db.collection('song_interactions')
                    .where('song_public_id', '==', songPublicId)
                    .where('interaction_type', '==', 'dislike')
                    .get();

                res.status(200).json({
                    likes: likesSnapshot.size,
                    dislikes: dislikesSnapshot.size
                });
            } else if (userId) {
                // Fetch all interactions for a specific user
                const userInteractionsSnapshot = await db.collection('song_interactions')
                    .where('user_id', '==', userId)
                    .get();

                const interactions = userInteractionsSnapshot.docs.map(doc => doc.data());
                res.status(200).json(interactions);
            } else {
                return res.status(400).json({ error: 'Missing songPublicId or userId parameter for GET request' });
            }

        } catch (error) {
            console.error('Firebase GET request error:', error);
            res.status(500).json({ error: 'Internal server error', details: error.message });
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
            const existingInteractionSnapshot = await db.collection('song_interactions')
                .where('song_public_id', '==', songPublicId)
                .where('user_id', '==', userId)
                .limit(1) // Limit to 1 as we only expect one unique interaction
                .get();

            let responseData = {};

            if (!existingInteractionSnapshot.empty) {
                // User has already interacted, update the existing interaction
                const docToUpdate = existingInteractionSnapshot.docs[0];
                if (docToUpdate.data().interaction_type === action) {
                    // Same action, do nothing
                    console.log(`User ${userId} already ${action}d song ${songPublicId}. No change.`);
                } else {
                    // Different action, update it
                    await docToUpdate.ref.update({ interaction_type: action, created_at: admin.firestore.FieldValue.serverTimestamp() });
                    console.log(`User ${userId} changed interaction for song ${songPublicId} to ${action}.`);
                }
            } else {
                // No existing interaction, create a new one
                await db.collection('song_interactions').add({
                    song_public_id: songPublicId,
                    user_id: userId,
                    interaction_type: action,
                    created_at: admin.firestore.FieldValue.serverTimestamp() // Use server timestamp
                });
                console.log(`User ${userId} ${action}d song ${songPublicId}.`);
            }

            // After insert/update, fetch and return the latest counts for the song
            const likesSnapshot = await db.collection('song_interactions')
                .where('song_public_id', '==', songPublicId)
                .where('interaction_type', '==', 'like')
                .get();

            const dislikesSnapshot = await db.collection('song_interactions')
                .where('song_public_id', '==', songPublicId)
                .where('interaction_type', '==', 'dislike')
                .get();

            res.status(200).json({
                likes: likesSnapshot.size,
                dislikes: dislikesSnapshot.size
            });

        } catch (error) {
            console.error('Firebase POST request error:', error);
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }

    } else {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
};

