import express from "express";
import "dotenv/config";
import { sendEmail } from "@hakwa/email";

const server = express();
server.listen(3000, async () => {
  console.log("Server is running on port 3000");

  await sendEmail({
    to: "taiatiniyara@gmail.com",
    subject: "Test Email",
    text: "This is a test email from Hakwa.",
  });
});
