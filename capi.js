// /api/capi.js
// Server-side Meta Conversions API relay.
//
// Reads META_PIXEL_ID and META_ACCESS_TOKEN from Vercel environment variables
// only — never hardcode these values here. Set them in:
// Vercel dashboard → Project → Settings → Environment Variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.error('Missing META_PIXEL_ID or META_ACCESS_TOKEN environment variables.');
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const {
      eventName,
      eventId,
      eventSourceUrl,
      fbp,
      fbc,
      extra,
    } = req.body || {};

    if (!eventName || !eventId) {
      return res.status(400).json({ error: 'eventName and eventId are required' });
    }

    // Basic bot / abuse guard: only allow a known set of event names.
    const ALLOWED_EVENTS = new Set(['PageView', 'ViewContent', 'InitiateCheckout']);
    if (!ALLOWED_EVENTS.has(eventName)) {
      return res.status(400).json({ error: 'Unsupported eventName' });
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : (forwardedFor || '').split(',')[0].trim() || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId, // must match the eventID used client-side for dedup
          event_source_url: eventSourceUrl,
          action_source: 'website',
          user_data: {
            client_ip_address: clientIp,
            client_user_agent: userAgent,
            ...(fbp ? { fbp } : {}),
            ...(fbc ? { fbc } : {}),
          },
          custom_data: extra || {},
        },
      ],
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      console.error('Meta CAPI error:', metaJson);
      return res.status(502).json({ error: 'Meta CAPI request failed' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('CAPI handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
