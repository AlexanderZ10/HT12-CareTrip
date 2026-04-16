export type BookingCheckoutStage = "form" | "processing" | "success";

export type BookingReceipt = {
  authorizationCode: string;
  destination: string;
  paymentIntentId: string;
  paymentMethod: string;
  paymentMode: "mock" | "stripe_test";
  processedAtLabel: string;
  providerBookingUrl: string;
  providerLabel: string;
  reservationStatusLabel: string;
  selectedStayLabel: string | null;
  selectedTransportLabel: string | null;
  serviceFeeLabel: string;
  subtotalLabel: string;
  totalLabel: string;
};
