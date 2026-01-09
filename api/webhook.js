const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { buffer } = require('micro');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Generate license key (XXXX-XXXX-XXXX format)
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let j = 0; j < 3; j++) {
    if (j > 0) result += '-';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
}

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  
  let event;
  
  try {
    const rawBody = await buffer(req);
    
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed: ' + err.message });
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Only process payments from Twitch Ad Crusher payment link
    const TWITCH_AD_CRUSHER_PLINK = 'plink_1SnYtR4k2cM54P72sWzS06dC';
    if (session.payment_link !== TWITCH_AD_CRUSHER_PLINK) {
      console.log('Skipping - not a Twitch Ad Crusher payment');
      return res.status(200).json({ received: true, skipped: true });
    }
    
    const email = session.customer_details?.email || session.customer_email;
    
    if (!email) {
      console.error('No email found in session');
      return res.status(400).json({ error: 'No email in session' });
    }

    try {
      // Check if license already exists for this payment
      const { data: existing } = await supabase
        .from('twitch_ad_crusher_licenses')
        .select('id')
        .eq('stripe_payment_id', session.id)
        .single();

      if (existing) {
        console.log('License already exists for this payment');
        return res.status(200).json({ received: true, existing: true });
      }

      // Generate unique license key
      let licenseKey;
      let isUnique = false;
      
      while (!isUnique) {
        licenseKey = generateLicenseKey();
        const { data: keyExists } = await supabase
          .from('twitch_ad_crusher_licenses')
          .select('id')
          .eq('license_key', licenseKey)
          .single();
        
        if (!keyExists) isUnique = true;
      }

      // Create license
      const { error: insertError } = await supabase
        .from('twitch_ad_crusher_licenses')
        .insert({
          email: email.toLowerCase(),
          license_key: licenseKey,
          stripe_payment_id: session.id,
          stripe_customer_id: session.customer,
          is_active: true,
          metadata: {
            amount: session.amount_total,
            currency: session.currency,
            payment_status: session.payment_status
          }
        });

      if (insertError) {
        console.error('Error creating license:', insertError);
        return res.status(500).json({ error: 'Failed to create license' });
      }

      console.log('License created for ' + email + ': ' + licenseKey);
      
    } catch (err) {
      console.error('Webhook processing error:', err);
      return res.status(500).json({ error: 'Processing failed' });
    }
  }

  return res.status(200).json({ received: true });
};

// Disable body parsing for Stripe signature verification
module.exports.config = {
  api: {
    bodyParser: false
  }
};
