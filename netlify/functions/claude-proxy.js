// Netlify Function — Claude API Proxy
// API key sunucu tarafında kalır, tarayıcıya çıkmaz.
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key yapılandırılmamış." }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Geçersiz JSON." }) }; }

  const { imageBase64, mediaType = "image/jpeg" } = body;
  if (!imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: "Görsel gönderilmedi." }) };
  }

  const prompt = `Bu depodaki kolilerin/paletlerin fotoğrafına bakarak:
1. Kaç palet veya büyük koli grubu görüyorsun?
2. Kaba tahmini toplam ağırlık nedir (kolilerin boyutuna göre)?
3. Düzenleme önerileri var mı?

Kısa ve net cevap ver. Türkçe yanıtla.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 }
            },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || "API hatası." }) };
    }

    const metin = data.content?.[0]?.text || "Yanıt alınamadı.";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sonuc: metin })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
