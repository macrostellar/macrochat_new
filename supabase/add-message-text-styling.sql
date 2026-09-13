-- Add text styling columns to macrochat_messages table
BEGIN;

ALTER TABLE public.macrochat_messages 
ADD COLUMN IF NOT EXISTS text_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS font_style text DEFAULT 'normal' CHECK (font_style IN ('normal', 'italic')),
ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Default';

COMMIT;
