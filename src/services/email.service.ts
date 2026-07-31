import { Resend } from 'resend';
import { logger } from '../lib/logger.ts';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev'; // Use verified domain in prod

// Lazy init to avoid crash on startup without key
let resend: Resend | null = null;

function getResendClient() {
  if (!resend && RESEND_API_KEY) {
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

export const sendWelcomeEmail = async (userEmail: string, userName: string) => {
  try {
    const client = getResendClient();
    if (!client) {
      logger.warn('Resend client not initialized. Skipping sendWelcomeEmail', { userEmail });
      return;
    }

    await client.emails.send({
      from: FROM_EMAIL,
      to: userEmail,
      subject: '¡Bienvenido a Proyecty!',
      html: `
        <h1>Hola ${userName},</h1>
        <p>Bienvenido a Proyecty. Estamos emocionados de tenerte a bordo.</p>
        <p>Empieza a gestionar tus proyectos de forma eficiente.</p>
      `,
    });
    logger.info('Welcome email sent', { userEmail });
  } catch (error) {
    logger.error('Failed to send welcome email', { error, userEmail });
  }
};

export const sendPaymentFailedEmail = async (userEmail: string, organizationName: string) => {
  try {
    const client = getResendClient();
    if (!client) {
      logger.warn('Resend client not initialized. Skipping sendPaymentFailedEmail', { userEmail });
      return;
    }

    await client.emails.send({
      from: FROM_EMAIL,
      to: userEmail,
      subject: 'Problema con el pago de tu suscripción',
      html: `
        <h1>Hola,</h1>
        <p>Hemos tenido un problema procesando el pago de tu suscripción para la organización <b>${organizationName}</b>.</p>
        <p>Por favor, actualiza tu método de pago para evitar la interrupción del servicio.</p>
      `,
    });
    logger.info('Payment failed email sent', { userEmail, organizationName });
  } catch (error) {
    logger.error('Failed to send payment failed email', { error, userEmail, organizationName });
  }
};

export const sendSubscriptionActivatedEmail = async (userEmail: string, planName: string) => {
  try {
    const client = getResendClient();
    if (!client) {
      logger.warn('Resend client not initialized. Skipping sendSubscriptionActivatedEmail', { userEmail });
      return;
    }

    await client.emails.send({
      from: FROM_EMAIL,
      to: userEmail,
      subject: '¡Suscripción activada con éxito!',
      html: `
        <h1>¡Gracias por tu compra!</h1>
        <p>Tu suscripción al plan <b>${planName}</b> se ha activado correctamente.</p>
        <p>Ya puedes disfrutar de todas las funcionalidades de tu nuevo plan.</p>
      `,
    });
    logger.info('Subscription activated email sent', { userEmail, planName });
  } catch (error) {
    logger.error('Failed to send subscription activated email', { error, userEmail, planName });
  }
};

export const sendNewExpenseNotification = async (adminEmail: string, expenseTitle: string, amount: number) => {
  try {
    const client = getResendClient();
    if (!client) {
      logger.warn('Resend client not initialized. Skipping sendNewExpenseNotification', { adminEmail });
      return;
    }

    await client.emails.send({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: 'Nuevo gasto pendiente de aprobación',
      html: `
        <h1>Se ha registrado un nuevo gasto</h1>
        <p>El gasto "<b>${expenseTitle}</b>" por un monto de $${amount} está pendiente de tu revisión y aprobación.</p>
        <p>Por favor ingresa a Proyecty para gestionarlo.</p>
      `,
    });
    logger.info('Expense notification email sent', { adminEmail, expenseTitle });
  } catch (error) {
    logger.error('Failed to send expense notification email', { error, adminEmail });
  }
};
