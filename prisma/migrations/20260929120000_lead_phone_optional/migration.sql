-- O visitante só precisa informar o nome; WhatsApp e e-mail passam a ser opcionais.
ALTER TABLE "Lead" ALTER COLUMN "phone" DROP NOT NULL;
