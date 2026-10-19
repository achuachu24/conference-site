# Supabase setup for USYS 2026 registration

This website is a static GitHub Pages site. Supabase provides the database and private file storage.

## 1. Create a Supabase project

1. Sign in to Supabase and create a new project.
2. Wait until the project is ready.
3. Open **SQL Editor**.
4. Copy the complete contents of `supabase/setup.sql` and run it once.

The SQL creates:

- `public.registrations` table
- Row Level Security (RLS)
- insert-only access for anonymous conference visitors
- private `payment-proofs` Storage bucket
- upload-only access for anonymous visitors

Visitors cannot read the registration table or download stored payment screenshots through the public website.

## 2. Get the browser-safe Supabase values

In the Supabase Dashboard, open the project's **Connect** dialog or **Settings -> API Keys** and copy:

- Project URL, e.g. `https://abcxyz.supabase.co`
- Publishable key, beginning with `sb_publishable_`

Do NOT use a Secret key or legacy service-role key in the website.

## 3. Configure the site

Edit `js/supabase-config.js`:

```js
window.USYS_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_REPLACE_ME',
  bucket: 'payment-proofs'
};
```

Replace only the URL and publishable key. Keep the bucket name as `payment-proofs` unless you also change `supabase/setup.sql` and `js/registration.js` consistently.

## 4. Test before publishing

Open the site with VS Code Live Server (or another local static server), then open `registration.html`.

Submit a test record with:

- Paper ID
- First Author's Name
- PNG/JPG/JPEG/WEBP screenshot below 5 MB

After success, verify in Supabase:

### Registration row
Dashboard -> Table Editor -> `registrations`

You should see `paper_id`, `first_author_name`, `payment_path`, file metadata, `status=pending`, and `created_at`.

### Payment screenshot
Dashboard -> Storage -> `payment-proofs` -> `submissions`

The bucket is private. Organizers can inspect/download files from the Dashboard.

## 5. Publish with GitHub Pages

Commit the static site to GitHub. This project no longer needs `server.js`, SQLite, Node.js or a running backend server.

Typical commands:

```bash
git add -A
git commit -m "migrate registration backend to Supabase"
git push origin main
```

Then verify GitHub repository **Settings -> Pages** is publishing the desired branch/folder.

If using the existing custom domain, keep the current `CNAME` file.

## Security notes

- The Supabase publishable key is expected to be present in browser code. Its permissions are controlled by RLS.
- Never put a Supabase Secret key or service-role key into HTML/JavaScript or GitHub.
- The table is configured as insert-only for public users.
- The payment bucket is private and public users receive upload-only permission.
- The form has a small honeypot anti-bot field, but for a high-traffic public launch consider adding CAPTCHA/Turnstile and server-side rate limiting via a Supabase Edge Function.
