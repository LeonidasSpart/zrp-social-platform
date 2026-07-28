// In PostComposer.tsx, add:
const [imageUrl, setImageUrl] = useState("");

// And in the form:
<input
  type="text"
  placeholder="Image URL (optional)"
  value={imageUrl}
  onChange={(e) => setImageUrl(e.target.value)}
/>
