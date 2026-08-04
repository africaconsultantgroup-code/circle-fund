-- Enum values must be committed before later migrations can use them.

alter type public.circle_status add value if not exists 'archived';
