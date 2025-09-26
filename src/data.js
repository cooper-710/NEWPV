export async function loadPitchData() {
  const res = await fetch('./pitch_data.json');
  return await res.json();
}
