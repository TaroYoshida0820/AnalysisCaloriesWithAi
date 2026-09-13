import { createClient } from '@supabase/supabase-js';

// これらはVercelの環境変数から Vite がビルド時に埋め込む値。
// VITE_ プレフィックスが付いた環境変数だけがブラウザ側コードに公開される。
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
