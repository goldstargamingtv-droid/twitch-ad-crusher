// Twitch Ad Crusher - Stripe Webhook Handler
// Vercel Serverless Function

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Generate license key (XXXX-XXXX-XXXX format)
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let j = 0; j < 3; j++) {
    if (j > 0) key += '-';
    for (let i = 0; i < 4; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return key;
}

// Send license email (you can integrate SendGrid, Resend, etc.)
async function sendLicenseEmail(email, licenseKey) {
  // For now, just log it - integrate your email provider here
  console.log(`📧 License for ${email}: ${licenseKey}`);
  
  // Example with Resend (uncomment and add RESEND_API_KEY to env):
  /*
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Twitch Ad Crusher <noreply@yourdomain.com>',
    to: email,
    subject: '🎮 Your Twitch Ad Crusher Pro License',
    html: `
      <h1>Thanks for purchasing Twitch Ad Crusher Pro!</h1>
      <p>Your license key is:</p>
      <h2 style="background:#9147ff;color:white;padding:16px;border-radius:8px;text-align:center;font-family:monospace;">
        ${licenseKey}
      </h2>
      <p>To activate:</p>
      <ol>
        <li>Click the Twitch Ad Crusher extension icon</li>
        <li>Click "Upgrade to Pro"</li>
        <li>Enter your email and license key</li>
        <li>Click "Activate License"</li>
      </ol>
      <p>Enjoy ad-free Twitch! 🚀</p>
    `
  });
  */
  
  return true;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Get customer email
    const email = session.customer_details?.email || session.customer_email;
    
    if (!email) {
      console.error('No email found in session');
      return res.status(400).json({ error: 'No email found' });
    }

    // Generate unique license key
    let licenseKey;
    let attempts = 0;
    
    while (attempts < 5) {
      licenseKey = generateLicenseKey();
      
      // Check if key already exists
      const { data: existing } = await supabase
        .from('licenses')
        .select('id')
        .eq('license_key', licenseKey)
        .single();
      
      if (!existing) break;
      attempts++;
    }

    // Create license in database
    const { data: license, error } = await supabase
      .from('licenses')
      .insert({
        email: email.toLowerCase(),
        license_key: licenseKey,
        stripe_payment_id: session.payment_intent,
        stripe_customer_id: session.customer,
        is_active: true,
        metadata: {
          product: 'twitch-ad-crusher-pro',
          amount: session.amount_total,
          currency: session.currency
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating license:', error);
      return res.status(500).json({ error: 'Failed to create license' });
    }

    // Send license email
    await sendLicenseEmail(email, licenseKey);

    console.log(`✅ License created for ${email}: ${licenseKey}`);
  }

  res.status(200).json({ received: true });
};

// Helper to get raw body for Stripe signature verification
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Vercel config - disable body parsing for raw body access
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
