-- Promote admin@ultron.tech to super_admin role
UPDATE public.profiles 
SET role = 'super_admin' 
WHERE email = 'admin@ultron.tech';
