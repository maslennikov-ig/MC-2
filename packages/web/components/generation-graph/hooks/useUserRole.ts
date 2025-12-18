import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase/browser-client';

export function useUserRole() {
  const { supabase, session } = useSupabase();
  const [role, setRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session?.user) {
        setRole(null);
        setIsAdmin(false);
        return;
    }

    const fetchRole = async () => {
      // Check metadata first (if available)
      // But usually we rely on DB
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();
      
      if (data) {
        setRole(data.role);
        setIsAdmin(data.role === 'admin' || data.role === 'superadmin');
      }
    };

    fetchRole();
  }, [session, supabase]);

  return { role, isAdmin };
}
