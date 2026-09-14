export type PhotoStatus = "pending" | "approved" | "rejected";

// `type` (not `interface`) so these are structurally compatible with
// @supabase/supabase-js's `Record<string, unknown>`-based GenericTable
// constraint below — an interface fails that check even when its shape
// matches, since TS won't treat a declaration-mergeable interface as
// having an implicit index signature.
export type Event = {
  id: string;
  organizer_id: string;
  name: string;
  slug: string;
  description: string | null;
  event_date: string | null;
  upload_starts_at: string | null;
  upload_ends_at: string | null;
  moderation_enabled: boolean;
  slideshow_interval_seconds: number;
  created_at: string;
};

export type Photo = {
  id: string;
  event_id: string;
  storage_path: string;
  uploader_name: string | null;
  status: PhotoStatus;
  in_slideshow: boolean;
  width: number | null;
  height: number | null;
  created_at: string;
};

// Minimal hand-written Database type (kept in sync with
// supabase/migrations by hand for this project's size — see
// specs/001-photo-collection-slideshow/design.md §2). Shaped to match
// @supabase/supabase-js's GenericSchema/GenericTable so `.from()`/`.rpc()`
// calls get real row types instead of silently falling back to `never`.
export type Database = {
  public: {
    Tables: {
      events: {
        Row: Event;
        Insert: Partial<Event> &
          Pick<Event, "name" | "slug" | "organizer_id">;
        Update: Partial<Event>;
        Relationships: [];
      };
      photos: {
        Row: Photo;
        Insert: Partial<Photo> &
          Pick<Photo, "event_id" | "storage_path" | "status">;
        Update: Partial<Photo>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_photo: {
        Args: {
          p_event_id: string;
          p_storage_path: string;
          p_uploader_name?: string | null;
          p_width?: number | null;
          p_height?: number | null;
        };
        Returns: Photo;
      };
    };
  };
};
