import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pyqqrejlyyuxbjpjviro.supabase.co";
const SUPABASE_KEY = "sb_publishable_zFhmHDquL4_ODIN560cEcA_oqBR7U0d";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
