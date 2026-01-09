// Twitch Ad Crusher - License Validation API
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

  const { email, licenseKey } = req.body;

  if (!email || !licenseKey) {
    return res.status(400).json({ 
      valid: false, 
      error: 'Email and license key are required' 
    });
  }

  try {
    // Look up license
    const { data: license, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('license_key', licenseKey.toUpperCase())
      .single();

    if (error || !license) {
      return res.status(200).json({ 
        valid: false, 
        error: 'Invalid license key or email' 
      });
    }

    // Check if license is active
    if (!license.is_active) {
      return res.status(200).json({ 
        valid: false, 
        error: 'License has been deactivated' 
      });
    }

    // Check if license has expired
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.status(200).json({ 
        valid: false, 
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

    // Return success with license info
    return res.status(200).json({
      valid: true,
      license: {
        email: license.email,
        createdAt: license.created_at,
        expiresAt: license.expires_at,
        features: {
          multiStream: true,
          detailedStats: true,
          customThemes: true,
          priorityUpdates: true
        }
      }
    });

  } catch (err) {
    console.error('Validation error:', err);
    return res.status(500).json({ 
      valid: false, 
      error: 'Server error' 
    });
  }
};
