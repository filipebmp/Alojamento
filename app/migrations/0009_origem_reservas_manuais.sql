-- As reservas criadas à mão passam a ter a plataforma escolhida no formulário.
-- As antigas com o n.º de reserva do Booking (9 a 11 algarismos) passam a "booking"; as restantes ficam "manual" (diretas).
UPDATE reservas SET origem = 'booking'
WHERE origem = 'manual' AND uid_externo IS NULL AND ref_booking IS NOT NULL
  AND length(trim(ref_booking)) BETWEEN 9 AND 11 AND trim(ref_booking) NOT GLOB '*[^0-9]*';
