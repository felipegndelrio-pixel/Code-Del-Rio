// Quem digita o dado no formulário errado (EN): o id da transação da Paddle (txn_…) no campo de license key da Gumroad e
// vice-versa. Só reconhece o FORMATO, no aparelho; nada vai ao servidor. Formatos: Paddle `txn_` + 26 caracteres a-z0-9 (id da
// transação, doc oficial); Gumroad license key = 4 grupos de 8 hexadecimais separados por hífen (8-8-8-8).
const PADDLE_TXN = /^txn_[a-z0-9]{26}$/i;
const GUMROAD_KEY = /^[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/i;

export const looksLikePaddleTransactionId = (value: string): boolean => PADDLE_TXN.test(value.trim());
export const looksLikeGumroadLicenseKey = (value: string): boolean => GUMROAD_KEY.test(value.trim());
