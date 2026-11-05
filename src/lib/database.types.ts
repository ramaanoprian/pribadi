// Tipe database. Dapat diregenerasi dengan `npm run db:types` (butuh Supabase lokal).
// Ditulis mengikuti format keluaran `supabase gen types typescript`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = 'owner' | 'admin' | 'admin_baking' | 'member';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: AppRole;
          nama: string;
          no_hp: string | null;
          email: string | null;
          aktif: boolean;
          last_sign_in_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { nama?: string; no_hp?: string | null };
        Relationships: [];
      };
      staff_invitations: {
        Row: {
          id: string;
          email: string;
          role: AppRole;
          nama: string;
          status: 'menunggu' | 'terkirim' | 'dibatalkan' | 'gagal';
          catatan: string | null;
          invited_by: string | null;
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          user_id: string | null;
          nama: string;
          phone_normalized: string;
          is_vip: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { nama: string; phone_normalized: string; is_vip?: boolean };
        Update: { nama?: string; phone_normalized?: string; is_vip?: boolean };
        Relationships: [];
      };
      addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          penerima: string;
          no_hp: string;
          alamat: string;
          catatan: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          label?: string;
          penerima: string;
          no_hp: string;
          alamat: string;
          catatan?: string | null;
          is_default?: boolean;
        };
        Update: {
          label?: string;
          penerima?: string;
          no_hp?: string;
          alamat?: string;
          catatan?: string | null;
          is_default?: boolean;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          tipe: 'teks' | 'angka' | 'boolean' | 'pilihan';
          opsi: Json;
          label: string;
          deskripsi: string | null;
          kategori: string;
          urutan: number;
          is_public: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: { value?: Json };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          created_at: string;
          actor_id: string | null;
          actor_role: string | null;
          actor_nama: string | null;
          aksi: string;
          entitas: string;
          entitas_id: string | null;
          data_lama: Json | null;
          data_baru: Json | null;
          alasan: string | null;
          meta: Json | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      normalize_phone: { Args: { p_phone: string }; Returns: string | null };
      create_staff_invitation: { Args: { p_email: string; p_role: AppRole; p_nama?: string }; Returns: string };
      cancel_staff_invitation: { Args: { p_id: string }; Returns: undefined };
      set_user_role: { Args: { p_user_id: string; p_role: AppRole; p_alasan?: string }; Returns: undefined };
      set_user_active: { Args: { p_user_id: string; p_aktif: boolean; p_alasan?: string }; Returns: undefined };
      log_activity: { Args: { p_aksi: string; p_entitas: string; p_meta?: Json }; Returns: undefined };
    };
    Enums: { app_role: AppRole };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
