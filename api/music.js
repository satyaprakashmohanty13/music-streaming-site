export default async function handler(req, res) {
  const CLOUD_NAME = "dauiqlm2g";
  const API_KEY = "312988233685697";
  const API_SECRET = "qfsOW67iFLfjIv02u-tNVWV794Y";

  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");

  const result = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/search`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expression: "resource_type:raw AND format:mp3",
      max_results: 100,
    }),
  });

  const data = await result.json();

  const songs = data.resources.map(file => ({
    title: file.public_id.split("/").pop(),
    url: file.secure_url,
  }));

  res.status(200).json(songs);
}
