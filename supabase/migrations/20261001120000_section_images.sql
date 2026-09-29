-- Header and footer images: each band's image is kept with its document.
-- `{ id, alt, image, width, height }`, where `image` is a key in the account's
-- private `images` bucket (20260930120000_images.sql). Small by nature; the
-- check keeps them that way. Null: the band has no image.
alter table public.documents
  add column header_image jsonb
    constraint documents_header_image_shape check (header_image is null or (jsonb_typeof(header_image) = 'object' and octet_length(header_image::text) <= 4096)),
  add column footer_image jsonb
    constraint documents_footer_image_shape check (footer_image is null or (jsonb_typeof(footer_image) = 'object' and octet_length(footer_image::text) <= 4096));
