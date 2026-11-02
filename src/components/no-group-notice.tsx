import { Card, CardBody } from "@/components/ui/card";

export function NoGroupNotice() {
  return (
    <Card>
      <CardBody>
        <h1 className="text-lg font-semibold text-foreground">Du bist in keiner Gruppe</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bitte einen Admin deiner Gruppe um Aufnahme.
        </p>
      </CardBody>
    </Card>
  );
}
