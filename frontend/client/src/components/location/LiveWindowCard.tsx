import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

const LIVE_WINDOW_URL = "/super-admin/settings/live-window";
const MAX_MINUTES = 1440;

interface LiveWindow {
  minutes: number;
}

const buildSchema = (t: (key: string) => string) =>
  z.object({
    minutes: z.coerce
      .number({ invalid_type_error: t("location.errMustBeNumber") })
      .int(t("location.errMustBeWholeNumber"))
      .min(1, t("location.errMinOneMinute"))
      .max(MAX_MINUTES, t("location.errMaxFreshWindow")),
  });

/** The live-map window, one value for every company (a platform setting). */
export function LiveWindowCard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const schema = useMemo(() => buildSchema(t), [t]);

  const { data } = useQuery<LiveWindow>({
    queryKey: [LIVE_WINDOW_URL],
    queryFn: () => apiRequest(LIVE_WINDOW_URL),
  });

  const form = useForm<LiveWindow>({
    resolver: zodResolver(schema),
    defaultValues: { minutes: undefined },
  });

  useEffect(() => {
    if (data) form.reset({ minutes: data.minutes });
  }, [data, form]);

  const save = useMutation({
    mutationFn: (values: LiveWindow) =>
      apiRequest(LIVE_WINDOW_URL, { method: "PUT", body: { minutes: values.minutes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIVE_WINDOW_URL] });
      toast({ title: t("common.success"), description: t("location.liveWindowSaved") });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error?.message || t("location.failedUpdateSettings"),
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("location.liveWindowTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("location.liveFreshWindow")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_MINUTES}
                      placeholder={t("location.liveFreshWindowPlaceholder")}
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-live-window-minutes"
                    />
                  </FormControl>
                  <FormDescription>{t("location.liveFreshWindowDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={save.isPending} data-testid="button-save-live-window">
                <Save className="h-4 w-4 me-2" />
                {save.isPending ? t("common.saving") : t("location.saveSettings")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
