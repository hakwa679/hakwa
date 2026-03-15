import nodemailer from "nodemailer";

const transporterOptions = {
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: Number(process.env.EMAIL_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
};

export const transporter = nodemailer.createTransport(transporterOptions);

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendEmail = async (options: EmailOptions) => {
  await transporter.sendMail({
    from: `"Hakwa Platform" <${process.env.EMAIL_USER}>`,
    ...options,
  });
};
