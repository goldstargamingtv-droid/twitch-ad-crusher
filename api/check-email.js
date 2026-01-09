// Twitch Ad Crusher - Check Email for License
// Used for auto-unlock after purchase (polling)
// Vercel Serverless Function

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

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ 
      found: false, 
      error: 'Email is required' 
    });
  }

  try {
    // Look up license by email (most recent)
    const { data: license, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !license) {
      return res.status(200).json({ 
        found: false 
      });
    }

    // Check if license has expired
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.status(200).json({ 
        found: false,
        error: 'License has expired'
      });
    }

    // Update activated_at if first activation
    if (!license.activated_at) {
      await supabase
        .from('licenses')
        .update({ activated_at: new Date().toISOString() })
        .eq('id', license.id);
    }

    // Return success with license key
    return res.status(200).json({
      found: true,
      licenseKey: license.license_key,
      email: license.email
    });

  } catch (err) {
    console.error('Check email error:', err);
    return res.status(500).json({ 
      found: false, 
      error: 'Server error' 
    });
  }
};
