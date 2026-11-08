import "./DispatchQueue.css";

export function DispatchQueue() {
  return <main className="dispatch-queue"><div className="queue-card">
    <header><h1>Ready for dispatch</h1><button type="button">Print packing slips</button></header>
    <p>Three orders are ready for the afternoon pickup.</p>
    <table><thead><tr><th>Order</th><th>Destination</th><th>Packages</th></tr></thead><tbody>
      <tr><td>PK-2048</td><td>North studio</td><td>2 boxes</td></tr>
      <tr><td>PK-2051</td><td>Harbor office</td><td>1 box</td></tr>
      <tr><td>PK-2054</td><td>West workshop</td><td>4 boxes</td></tr>
    </tbody></table><p>Pickup closes at 16:30.</p>
  </div></main>;
}
