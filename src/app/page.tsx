import { redirect } from "next/navigation";

export default function Home() {
  // Keep / clean; send users to the board
  redirect("/features");
}
