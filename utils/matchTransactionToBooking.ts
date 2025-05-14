// utils/matchTransactionToBooking.ts

import { BookingDTO } from "@/types/BookingDTO";
import { BankTransaction } from "@/types/BankTransaction";

// Функция для автоматического сопоставления транзакции с заявкой
export function matchTransactionToBooking(
  txn: BankTransaction,
  bookings: BookingDTO[]
): string | null {
  // Попробовать найти по bookingNumber в назначении платежа
  const possibleNumbers = bookings.map(b => b.bookingNumber).filter(Boolean);

  if (txn.remittanceInformationUnstructured) {
    const foundNumber = possibleNumbers.find(num =>
      txn.remittanceInformationUnstructured?.includes(num!)
    );
    if (foundNumber) return foundNumber;
  }

  // Найти по IBAN получателя (если совпадает с заявкой)
  if (txn.creditorAccount?.iban) {
    const found = bookings.find(b =>
      b.invoiceIban && b.invoiceIban === txn.creditorAccount.iban
    );
    if (found) return found.bookingNumber!;
  }

  // Найти по сумме и дате (±2 дня)
  const txnDate = new Date(txn.bookingDate);
  const foundByAmount = bookings.find(b => {
    if (!b.bruttoClient) return false;
    const diff = Math.abs(parseFloat(b.bruttoClient.toString()) - Math.abs(parseFloat(txn.transactionAmount.amount)));
    if (diff > 2) return false; // допускаем расхождение в 2€
    if (!b.checkIn) return false;
    const bookingDate = new Date(b.checkIn);
    const daysDiff = Math.abs((bookingDate.getTime() - txnDate.getTime()) / (1000*60*60*24));
    return daysDiff < 3;
  });
  if (foundByAmount) return foundByAmount.bookingNumber!;

  // Если ничего не нашли — вернуть null
  return null;
}