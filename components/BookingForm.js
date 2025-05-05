// components/BookingForm.js
import { useState, useEffect } from "react";

export default function BookingForm({
  initialData = {},
  onSubmit,
  isManager = false,
  agentName = "",
  agentAgency = ""
}) {
  // Form field states
  const [bookingCode, setBookingCode] = useState(initialData.bookingCode || "");
  const [operator, setOperator] = useState(initialData.operator || "");
  const [hotel, setHotel] = useState(initialData.hotel || "");
  const [checkIn, setCheckIn] = useState(initialData.checkIn || "");
  const [checkOut, setCheckOut] = useState(initialData.checkOut || "");
  const [room, setRoom] = useState(initialData.room || "");
  const [bruttoClient, setBruttoClient] = useState(initialData.bruttoClient || "");
  const [bruttoOperator, setBruttoOperator] = useState(initialData.bruttoOperator || "");
  const [net, setNet] = useState(initialData.net || "");
  const [commission, setCommission] = useState(initialData.commission || 0);
  const [comment, setComment] = useState(initialData.comment || "");
  const [invoiceLink, setInvoiceLink] = useState(initialData.invoiceLink || "");
  const [status, setStatus] = useState(initialData.status || "Pending");
  const [tourists, setTourists] = useState(initialData.tourists || [{ name: "", dob: "" }]);

  // Calculate commission whenever inputs change
  useEffect(() => {
    const bc = parseFloat(bruttoClient) || 0;
    const bo = parseFloat(bruttoOperator) || 0;
    const n = parseFloat(net) || 0;
    let comm = 0;
    const opName = operator.toUpperCase();
    if (opName.includes("TOCO TOUR RO") || opName.includes("TOCO TOUR MD")) {
      comm = (bc - n) * 0.8;
    } else {
      comm = bo * 0.03 + (bc - bo) * 0.8;
    }
    comm = Math.round(comm * 100) / 100;  // round to 2 decimals
    setCommission(comm);
  }, [bruttoClient, bruttoOperator, net, operator]);

  // Functions to manage tourist list
  const addTourist = () => setTourists([...tourists, { name: "", dob: "" }]);
  const updateTourist = (index, field, value) => {
    setTourists(tourists.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Remove empty tourist entries
    const cleanedTourists = tourists.filter(t => t.name || t.dob);
    const data = {
      bookingCode,
      operator,
      hotel,
      checkIn,
      checkOut,
      room,
      tourists: cleanedTourists,
      bruttoClient: parseFloat(bruttoClient) || 0,
      bruttoOperator: parseFloat(bruttoOperator) || 0,
      net: net ? parseFloat(net) : (parseFloat(bruttoOperator) || 0),
      commission,
      comment,
      invoiceLink,
      status: isManager ? status : "Pending",
      // agentId/Name/Agency will be set in parent onSubmit for new bookings, 
      // or remain unchanged for edits
    };
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Agent info (read-only for managers) */}
      {isManager && (
        <div className="bg-gray-100 p-2 rounded text-sm text-gray-700">
          <p><strong>Agent Name:</strong> {agentName}</p>
          <p><strong>Agency:</strong> {agentAgency}</p>
        </div>
      )}

      <div>
        <label className="block font-medium">Booking Code</label>
        <input 
          type="text" 
          value={bookingCode} 
          onChange={e => setBookingCode(e.target.value)} 
          className="w-full border px-3 py-1 rounded" required 
        />
      </div>
      <div>
        <label className="block font-medium">Operator</label>
        <input 
          type="text" 
          value={operator} 
          onChange={e => setOperator(e.target.value)} 
          className="w-full border px-3 py-1 rounded" required 
          list="operators-list"
        />
        <datalist id="operators-list">
          <option value="TOCO TOUR RO" />
          <option value="TOCO TOUR MD" />
          {/* Other operators can be added here */}
        </datalist>
      </div>
      <div>
        <label className="block font-medium">Hotel</label>
        <input 
          type="text" 
          value={hotel} 
          onChange={e => setHotel(e.target.value)} 
          className="w-full border px-3 py-1 rounded" required 
        />
      </div>
      <div className="flex space-x-4">
        <div className="flex-1">
          <label className="block font-medium">Check-In</label>
          <input 
            type="date" 
            value={checkIn} 
            onChange={e => setCheckIn(e.target.value)} 
            className="w-full border px-2 py-1 rounded" required 
          />
        </div>
        <div className="flex-1">
          <label className="block font-medium">Check-Out</label>
          <input 
            type="date" 
            value={checkOut} 
            onChange={e => setCheckOut(e.target.value)} 
            className="w-full border px-2 py-1 rounded" required 
          />
        </div>
      </div>
      <div>
        <label className="block font-medium">Room</label>
        <input 
          type="text" 
          value={room} 
          onChange={e => setRoom(e.target.value)} 
          className="w-full border px-3 py-1 rounded" 
          placeholder="e.g., Double, Sea View" 
        />
      </div>
      {/* Tourists list */}
      <div>
        <label className="block font-medium">Tourists</label>
        {tourists.map((t, idx) => (
          <div key={idx} className="flex space-x-2 mb-2">
            <input 
              type="text" placeholder="Name" 
              value={t.name} 
              onChange={e => updateTourist(idx, "name", e.target.value)} 
              className="flex-1 border px-2 py-1 rounded"
              required={idx === 0} 
            />
            <input 
              type="date" placeholder="DOB" 
              value={t.dob} 
              onChange={e => updateTourist(idx, "dob", e.target.value)} 
              className="flex-1 border px-2 py-1 rounded"
              required={idx === 0} 
            />
          </div>
        ))}
        <button type="button" onClick={addTourist} className="text-blue-600 text-sm">
          + Add Tourist
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Brutto Client (€)</label>
          <input 
            type="number" step="0.01" 
            value={bruttoClient} 
            onChange={e => setBruttoClient(e.target.value)} 
            className="w-full border px-3 py-1 rounded" required 
          />
        </div>
        <div>
          <label className="block font-medium">Brutto Operator (€)</label>
          <input 
            type="number" step="0.01" 
            value={bruttoOperator} 
            onChange={e => setBruttoOperator(e.target.value)} 
            className="w-full border px-3 py-1 rounded" required 
          />
        </div>
      </div>
      <div>
        <label className="block font-medium">Net (Internal Cost)</label>
        <input 
          type="number" step="0.01" 
          value={net} 
          onChange={e => setNet(e.target.value)} 
          className="w-full border px-3 py-1 rounded"
          disabled={!isManager && !(operator.toUpperCase().includes("TOCO TOUR"))}
          placeholder={!isManager ? (operator.toUpperCase().includes("TOCO") ? "Net cost" : "(auto = operator)") : ""}
        />
      </div>
      <div>
        <label className="block font-medium">Comment</label>
        <textarea 
          value={comment} 
          onChange={e => setComment(e.target.value)} 
          className="w-full border px-3 py-1 rounded"
          placeholder="Additional notes (optional)" 
        />
      </div>
      <div>
        <label className="block font-medium">Invoice Link</label>
        <input 
          type="url" 
          value={invoiceLink} 
          onChange={e => setInvoiceLink(e.target.value)} 
          className="w-full border px-3 py-1 rounded"
          placeholder="URL for payment invoice (if any)" 
        />
      </div>
      {isManager && (
        <div>
          <label className="block font-medium">Status</label>
          <select 
            value={status} 
            onChange={e => setStatus(e.target.value)} 
            className="w-full border px-3 py-1 rounded"
          >
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      )}

      {/* Commission and profit summary */}
      <div className="p-3 bg-gray-50 border rounded text-sm">
        <p><strong>Calculated Commission:</strong> {commission.toFixed(2)}</p>
        {isManager && (() => {
          const bc = parseFloat(bruttoClient) || 0;
          const n = parseFloat(net || bruttoOperator) || 0;
          const comm = commission;
          const agentNetComm = Math.round(comm * 0.9 * 100) / 100;
          const tax = Math.round(comm * 0.1 * 100) / 100;
          const bankFee = invoiceLink ? Math.round(bc * 0.0115 * 100) / 100 : 0;
          const grossProfit = Math.round(((bc - n) - comm) * 100) / 100;
          const netProfit = Math.round((grossProfit - bankFee) * 100) / 100;
          return (
            <>
              <p><strong>Agent Commission (gross):</strong> {comm.toFixed(2)}</p>
              <p><strong>Agent Commission after 10% tax:</strong> {agentNetComm.toFixed(2)} (tax {tax.toFixed(2)})</p>
              <p><strong>Payment Link Fee (1.15%):</strong> {bankFee.toFixed(2)}</p>
              <p><strong>Crocus Profit (after costs):</strong> {netProfit.toFixed(2)}</p>
            </>
          );
        })()}
      </div>

      <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
        {isManager ? "Save Changes" : "Create Booking"}
      </button>
    </form>
  );
}