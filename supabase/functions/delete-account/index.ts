import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonResponse = (status: number, message: string) => new Response(JSON.stringify({ error: message }), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse(405, 'Method not allowed');
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return jsonResponse(401, 'Unauthorized');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Account deletion function is missing Supabase environment variables');
    return jsonResponse(500, 'Account deletion is not configured on the server');
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse(401, 'Your session is invalid or expired. Sign in again and retry.');

    const admin = createClient(supabaseUrl, serviceRoleKey);
    // Delete batches from offset zero so all retained images are removed before the identity.
    while (true) {
      const { data: objects, error: listError } = await admin.storage.from('vault-images').list(user.id, { limit: 100 });
      if (listError) {
        console.error('Could not list account images for deletion', listError);
        return jsonResponse(500, 'Could not list your stored Vault images. Your account was not deleted.');
      }
      if (!objects?.length) break;
      const { error: removeError } = await admin.storage.from('vault-images').remove(objects.map((item) => `${user.id}/${item.name}`));
      if (removeError) {
        console.error('Could not remove account images', removeError);
        return jsonResponse(500, 'Could not remove your stored Vault images. Your account was not deleted.');
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('Could not delete auth user', deleteError);
      return jsonResponse(500, 'Could not delete your account. Please try again or contact support.');
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Unexpected account deletion error', error);
    return jsonResponse(500, 'An unexpected server error prevented account deletion.');
  }
});
