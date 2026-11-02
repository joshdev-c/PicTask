import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });
  const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  // Delete batches from offset zero so accounts with more than 1,000 images
  // are completely cleaned up before the identity is removed.
  while (true) {
    const { data: objects, error: listError } = await admin.storage.from('vault-images').list(user.id, { limit: 100 });
    if (listError) return new Response('Could not list stored images', { status: 500 });
    if (!objects?.length) break;
    const { error: removeError } = await admin.storage.from('vault-images').remove(objects.map((item) => `${user.id}/${item.name}`));
    if (removeError) return new Response('Could not remove stored images', { status: 500 });
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  return error ? new Response(error.message, { status: 400 }) : new Response(null, { status: 204 });
});
