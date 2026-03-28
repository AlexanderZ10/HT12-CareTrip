export type BookingCheckoutStage = "form" | "processing" | "success";

export type BookingReceipt = {
  authorizationCode: string;
  destination: string;
  paymentIntentId: string;
  paymentMethod: string;
  paymentMode: "mock" | "stripe_test";
  processedAtLabel: string;
  selectedStayLabel: string | null;
  selectedTransportLabel: string | null;
  totalLabel: string;
};
