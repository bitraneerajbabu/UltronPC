-- Force confirm the email for admin@ultron.tech
UPDATE auth.users 
SET email_confirmed_at = timezone('utc'::text, now()) 
WHERE email = 'admin@ultron.tech';
