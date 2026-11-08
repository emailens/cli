import { Body, Html, Text } from "@react-email/components";

// React Email 5 and earlier: components from @react-email/components.
export default function Legacy() {
  return (
    <Html lang="en">
      <Body>
        <Text>Still renders</Text>
      </Body>
    </Html>
  );
}
