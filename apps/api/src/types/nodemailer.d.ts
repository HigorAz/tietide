// nodemailer is an OPTIONAL dependency (only used by the SMTP mail transport in
// production) and ships no bundled types, so we declare it as an untyped module.
// mail.transport.ts narrows the slice it uses via a local structural type.
declare module 'nodemailer';
