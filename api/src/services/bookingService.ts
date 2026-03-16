import { sendNotification } from "@hakwa/notifications";

/**
 * Booking service — handles booking lifecycle operations.
 *
 * Notification integration: call sendNotification at each state transition.
 * Business logic (DB writes, fare calculation, etc.) to be implemented in
 * subsequent features.
 */

export async function onBookingConfirmed(
  passengerId: string,
  bookingId: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "booking_confirmed",
    {
      channel: "push",
      title: "Booking confirmed",
      body: "Your booking has been confirmed. A driver will be assigned shortly.",
      data: { screen: "BookingStatus", bookingId },
    },
    `booking_confirmed:${bookingId}`,
  );
  await sendNotification(
    passengerId,
    "booking_confirmed",
    {
      channel: "in_app",
      title: "Booking confirmed",
      body: "Your booking has been confirmed.",
      data: { screen: "BookingStatus", bookingId },
    },
    `booking_confirmed:${bookingId}:in_app`,
  );
}

export async function onDriverAccepted(
  passengerId: string,
  tripId: string,
  driverName: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "driver_accepted",
    {
      channel: "push",
      title: "Driver on the way",
      body: `${driverName} has accepted your ride request.`,
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_accepted:${tripId}`,
  );
  await sendNotification(
    passengerId,
    "driver_accepted",
    {
      channel: "in_app",
      title: "Driver on the way",
      body: `${driverName} has accepted your ride.`,
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_accepted:${tripId}:in_app`,
  );
}

export async function onDriverEnRoute(
  passengerId: string,
  tripId: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "driver_en_route",
    {
      channel: "push",
      title: "Driver en route",
      body: "Your driver is on the way to your pickup location.",
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_en_route:${tripId}`,
  );
}

export async function onDriverArrived(
  passengerId: string,
  tripId: string,
  driverName: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "driver_arrived",
    {
      channel: "push",
      title: "Your driver has arrived",
      body: `${driverName} is waiting at your pickup location.`,
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_arrived:${tripId}`,
  );
  await sendNotification(
    passengerId,
    "driver_arrived",
    {
      channel: "in_app",
      title: "Driver arrived",
      body: "Your driver is outside.",
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_arrived:${tripId}:in_app`,
  );
}
