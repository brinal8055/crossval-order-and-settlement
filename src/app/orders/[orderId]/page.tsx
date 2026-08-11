import OrderDetail from "@/app/components/order-detail";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <OrderDetail orderId={orderId} />;
}
