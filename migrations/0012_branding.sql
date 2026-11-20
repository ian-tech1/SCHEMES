-- Document header / footer branding and the permission model around it.
--
-- Teachers asked to be able to strip or change the header and footer that print
-- on every downloaded document. That is a branding decision, so the desk owns the
-- default AND the permission: an administrator decides globally, and may make an
-- exception for one teacher or one school. A teacher's own choice is stored on
-- their profile but is only honoured while the policy allows it.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS header_text text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS footer_text text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS header_default_on boolean NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS footer_default_on boolean NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS school_logo text NOT NULL DEFAULT '';
-- Global permission switches for the whole staffroom.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS teacher_may_edit_branding boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS teacher_may_hide_branding boolean NOT NULL DEFAULT false;

-- Per-teacher state: the chosen mode, the custom text, and an explicit
-- override of the global policy ("inherit" is the normal case).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS header_mode text NOT NULL DEFAULT 'default'
  CHECK (header_mode IN ('default', 'custom', 'off'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS footer_mode text NOT NULL DEFAULT 'default'
  CHECK (footer_mode IN ('default', 'custom', 'off'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS header_text text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS footer_text text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branding_grant text NOT NULL DEFAULT 'inherit'
  CHECK (branding_grant IN ('inherit', 'allowed', 'blocked'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_logo text NOT NULL DEFAULT '';
