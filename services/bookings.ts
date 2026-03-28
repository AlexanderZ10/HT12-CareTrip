import {
  saveBookingForUser as _saveBookingForUser,
  type BookingOrder,
} from "../utils/bookings";

/**
 * Save a booking order to the user's profile document.
 * Delegates to the existing utility which handles the Firestore transaction.
 */
export function saveBooking(uid: string, bookingData: BookingOrder) {
  return _saveBookingForUser(uid, bookingData);
}

// Re-export commonly needed types for consumers of this service.
export type { BookingOrder } from "../utils/bookings";
