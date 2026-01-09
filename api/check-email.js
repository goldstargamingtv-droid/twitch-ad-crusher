const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const { data: license, error } = await supabase
      .from('twitch_ad_crusher_licenses')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !license) {
      return res.status(200).json({ found: false });
    }

    // Update activated_at if first activation
    if (!license.activated_at) {
      await supabase
        .from('twitch_ad_crusher_licenses')
        .update({ activated_at: new Date().toISOString() })
        .eq('id', license.id);
    }

    return res.status(200).json({
      found: true,
      email: license.email,
      licenseKey: license.license_key
    });

  } catch (err) {
    console.error('Check email error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
