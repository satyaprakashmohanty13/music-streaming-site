// api/music.js
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary using environment variables
// IMPORTANT: Set these environment variables in your Vercel project settings
// CLOUDINARY_CLOUD_NAME
// CLOUDINARY_API_KEY
// CLOUDINARY_API_SECRET
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // Use HTTPS
});

module.exports = async (req, res) => {
    // Set CORS headers to allow requests from any origin (for development)
    // In production, you might want to restrict this to your frontend domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Use Cloudinary Search API to find audio files
        // Cloudinary treats audio files as 'video' resource type for search
        const result = await cloudinary.search
            .expression('resource_type:video AND (format:mp3 OR format:wav)')
            .max_results(500) // Adjust as needed, max 500 per request
            .execute();

        // Extract relevant information (public_id and secure_url)
        const audioFiles = result.resources.map(resource => ({
            public_id: resource.public_id,
            secure_url: resource.secure_url
        }));

        res.status(200).json(audioFiles);
    } catch (error) {
        console.error('Cloudinary API Error:', error);
        res.status(500).json({ error: 'Failed to fetch music files from Cloudinary', details: error.message });
    }
};

