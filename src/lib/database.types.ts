// Tipe database. Dapat diregenerasi dengan `npm run db:types` (butuh Supabase lokal).
// Ditulis mengikuti format keluaran `supabase gen types typescript`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = 'owner' | 'admin' | 'admin_baking' | 'member';
export type SaleMode = 'ready_stock' | 'preorder';
export type OrderStatus = 'menunggu_konfirmasi' | 'dikonfirmasi' | 'siap' | 'selesai' | 'dibatalkan';
export type Fulfillment = 'ambil' | 'antar';
export type PaymentStatus = 'belum_bayar' | 'lunas';
export type WaStatus = 'pending' | 'mengirim' | 'terkirim' | 'gagal';

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
      categories: {
        Row: { id: string; nama: string; slug: string; urutan: number; aktif: boolean; created_at: string; updated_at: string };
        Insert: { nama: string; slug: string; urutan?: number; aktif?: boolean };
        Update: { nama?: string; slug?: string; urutan?: number; aktif?: boolean };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string | null;
          nama: string;
          slug: string;
          deskripsi: string;
          harga: number;
          satuan: string;
          sale_mode: SaleMode;
          stok: number;
          gambar_path: string | null;
          aktif: boolean;
          urutan: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          nama: string;
          slug: string;
          deskripsi?: string;
          harga: number;
          satuan?: string;
          sale_mode?: SaleMode;
          gambar_path?: string | null;
          aktif?: boolean;
          urutan?: number;
        };
        Update: {
          category_id?: string | null;
          nama?: string;
          slug?: string;
          deskripsi?: string;
          harga?: number;
          satuan?: string;
          sale_mode?: SaleMode;
          gambar_path?: string | null;
          aktif?: boolean;
          urutan?: number;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: number;
          product_id: string | null;
          ingredient_id: string | null;
          qty: number;
          stok_sesudah: number;
          jenis: string;
          ref_tabel: string | null;
          ref_id: string | null;
          alasan: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      promos: {
        Row: {
          id: string;
          kode: string;
          nama: string;
          tipe: 'persen' | 'nominal';
          nilai: number;
          min_belanja: number;
          maks_diskon: number | null;
          mulai: string | null;
          selesai: string | null;
          kuota: number | null;
          aktif: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          kode: string;
          nama: string;
          tipe: 'persen' | 'nominal';
          nilai: number;
          min_belanja?: number;
          maks_diskon?: number | null;
          mulai?: string | null;
          selesai?: string | null;
          kuota?: number | null;
          aktif?: boolean;
        };
        Update: Partial<Database['public']['Tables']['promos']['Insert']>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          kode: string;
          tracking_code: string;
          customer_id: string;
          user_id: string | null;
          nama_pemesan: string;
          no_hp: string;
          status: OrderStatus;
          fulfillment: Fulfillment;
          jadwal: string;
          alamat_antar: string | null;
          catatan: string | null;
          subtotal: number;
          diskon: number;
          promo_id: string | null;
          promo_kode: string | null;
          shipping_cost: number;
          ongkir_diset: boolean;
          gratis_ongkir: boolean;
          courier_name: string | null;
          total: number;
          payment_status: PaymentStatus;
          bukti_transfer_path: string | null;
          persetujuan_wa: boolean;
          stok_dipotong: boolean;
          confirmed_at: string | null;
          confirmed_by: string | null;
          ready_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          alasan_batal: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'orders_customer_id_fkey'; columns: ['customer_id']; isOneToOne: false; referencedRelation: 'customers'; referencedColumns: ['id'] },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          nama_produk: string;
          satuan: string;
          sale_mode: SaleMode;
          harga: number;
          qty: number;
          subtotal: number;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'order_items_order_id_fkey'; columns: ['order_id']; isOneToOne: false; referencedRelation: 'orders'; referencedColumns: ['id'] },
        ];
      };
      site_content: {
        Row: {
          key: string;
          label: string;
          tipe: 'teks' | 'paragraf' | 'url';
          value: string;
          grup: string;
          urutan: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: { value?: string };
        Relationships: [];
      };
      whatsapp_templates: {
        Row: { tahap: string; judul: string; isi: string; aktif: boolean; urutan: number; updated_by: string | null; updated_at: string };
        Insert: never;
        Update: { isi?: string; aktif?: boolean };
        Relationships: [];
      };
      whatsapp_messages: {
        Row: {
          id: string;
          order_id: string | null;
          customer_id: string | null;
          tahap: string;
          to_phone: string;
          body: string;
          status: WaStatus;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string;
          last_attempt_at: string | null;
          locked_at: string | null;
          last_error: string | null;
          provider: string | null;
          provider_message_id: string | null;
          sent_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'whatsapp_messages_order_id_fkey'; columns: ['order_id']; isOneToOne: false; referencedRelation: 'orders'; referencedColumns: ['id'] },
        ];
      };
      ingredients: {
        Row: { id: string; nama: string; satuan: string; stok: number; min_stock: number; aktif: boolean; created_at: string; updated_at: string };
        Insert: { nama: string; satuan: string; min_stock?: number; aktif?: boolean };
        Update: { nama?: string; satuan?: string; min_stock?: number; aktif?: boolean };
        Relationships: [];
      };
      recipes: {
        Row: { id: string; product_id: string; yield_per_batch: number; catatan: string | null; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      recipe_items: {
        Row: { id: string; recipe_id: string; ingredient_id: string; qty_per_batch: number };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'recipe_items_recipe_id_fkey'; columns: ['recipe_id']; isOneToOne: false; referencedRelation: 'recipes'; referencedColumns: ['id'] },
          { foreignKeyName: 'recipe_items_ingredient_id_fkey'; columns: ['ingredient_id']; isOneToOne: false; referencedRelation: 'ingredients'; referencedColumns: ['id'] },
        ];
      };
      production_logs: {
        Row: {
          id: string;
          product_id: string;
          nama_produk: string;
          batches: number;
          total_output: number;
          bahan_kurang: boolean;
          status: 'aktif' | 'dibatalkan';
          created_by: string;
          created_at: string;
          cancelled_by: string | null;
          cancelled_at: string | null;
          alasan: string | null;
        };
        Insert: never;
        Update: never;
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
    Views: {
      katalog_kategori: { Row: { id: string; nama: string; slug: string; urutan: number }; Relationships: [] };
      katalog_produk: {
        Row: {
          id: string;
          nama: string;
          slug: string;
          deskripsi: string;
          harga: number;
          satuan: string;
          sale_mode: SaleMode;
          stok: number | null;
          gambar_path: string | null;
          urutan: number;
          category_id: string | null;
          kategori_nama: string | null;
          kategori_slug: string | null;
        };
        Relationships: [];
      };
      konten_publik: { Row: { key: string; value: string }; Relationships: [] };
      pengaturan_publik: { Row: { key: string; value: Json }; Relationships: [] };
      biaya_produk: { Row: { id: string; cost_per_unit: number }; Relationships: [] };
      biaya_bahan: { Row: { id: string; cost_per_unit: number }; Relationships: [] };
      biaya_produksi: { Row: { id: string; hpp_snapshot: number; hpp_per_unit: number; bahan_snapshot: Json }; Relationships: [] };
      nama_staf: { Row: { id: string; nama: string }; Relationships: [] };
    };
    Functions: {
      normalize_phone: { Args: { p_phone: string }; Returns: string | null };
      create_staff_invitation: { Args: { p_email: string; p_role: AppRole; p_nama?: string }; Returns: string };
      cancel_staff_invitation: { Args: { p_id: string }; Returns: undefined };
      set_user_role: { Args: { p_user_id: string; p_role: AppRole; p_alasan?: string }; Returns: undefined };
      set_user_active: { Args: { p_user_id: string; p_aktif: boolean; p_alasan?: string }; Returns: undefined };
      log_activity: { Args: { p_aksi: string; p_entitas: string; p_meta?: Json }; Returns: undefined };
      check_promo: { Args: { p_kode: string; p_subtotal: number }; Returns: Json };
      create_order: {
        Args: {
          p_nama: string;
          p_no_hp: string;
          p_fulfillment: Fulfillment;
          p_jadwal: string;
          p_items: Json;
          p_alamat?: string | null;
          p_catatan?: string | null;
          p_kode_promo?: string | null;
          p_persetujuan_wa?: boolean;
        };
        Returns: Json;
      };
      track_order: { Args: { p_kode: string; p_no_hp: string }; Returns: Json };
      track_order_by_token: { Args: { p_token: string }; Returns: Json };
      set_order_shipping: { Args: { p_id: string; p_ongkir?: number | null; p_kurir?: string | null }; Returns: undefined };
      confirm_order_payment: { Args: { p_id: string; p_bukti_path?: string | null }; Returns: undefined };
      mark_order_ready: { Args: { p_id: string }; Returns: undefined };
      complete_order: { Args: { p_id: string }; Returns: undefined };
      cancel_order: { Args: { p_id: string; p_alasan: string }; Returns: undefined };
      my_effective_role: { Args: Record<string, never>; Returns: string | null };
      wa_resend: { Args: { p_id: string }; Returns: undefined };
      wa_enqueue_test: { Args: { p_to: string; p_pesan?: string | null }; Returns: string };
      production_products: {
        Args: Record<string, never>;
        Returns: { product_id: string; nama: string; satuan: string; sale_mode: SaleMode; stok: number; yield_per_batch: number; gambar_path: string | null }[];
      };
      production_preview: { Args: { p_product_id: string; p_batches: number }; Returns: Json };
      record_production: { Args: { p_product_id: string; p_batches: number }; Returns: Json };
      cancel_production: { Args: { p_id: string; p_alasan: string }; Returns: undefined };
      production_today: { Args: Record<string, never>; Returns: { product_id: string; nama_produk: string; satuan: string; batches: number; hasil: number }[] };
      add_ingredient_stock: { Args: { p_ingredient_id: string; p_qty: number; p_total_harga: number; p_catatan?: string | null }; Returns: number };
      adjust_ingredient_stock: { Args: { p_ingredient_id: string; p_delta: number; p_alasan: string }; Returns: number };
      save_recipe: { Args: { p_product_id: string; p_yield: number; p_items: Json; p_catatan?: string | null }; Returns: string };
      adjust_product_stock: { Args: { p_product_id: string; p_delta: number; p_alasan: string }; Returns: number };
    };
    Enums: { app_role: AppRole; sale_mode: SaleMode; order_status: OrderStatus; fulfillment: Fulfillment; payment_status: PaymentStatus };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
