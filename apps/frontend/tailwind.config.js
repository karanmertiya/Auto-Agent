/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f4efe4",
        ink: "#192126",
        leaf: "#1f8c5c",
        ocean: "#2563eb",
        ember: "#f97316"
      },
      boxShadow: {
        float: "0 24px 80px rgba(15, 23, 42, 0.12)"
      }
    }
  },
  plugins: []
};

