import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export async function passwordRequirement() {
  const { data, error } = await supabase.rpc("password_change_required");
  if (error) throw new Error("Não foi possível conferir a exigência de senha. Tente novamente.");
  return data === true;
}

export async function signOutAdmin(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
}
