import { Body, Head, Html, Section, Tailwind, Text } from "react-email";

// The trap React Email's Tailwind sets: flex and gap look right in the browser preview.
export default function Plan() {
  return (
    <Html lang="en">
      <Tailwind>
        <Head />
        <Body className="bg-white font-sans">
          <Section className="flex gap-4">
            <Text className="text-gray-900">Pro</Text>
            <Text className="text-gray-900">$39</Text>
          </Section>
        </Body>
      </Tailwind>
    </Html>
  );
}
