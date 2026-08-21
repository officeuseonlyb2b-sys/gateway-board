import { useParams } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Download, Share2, MoreVertical, CheckCircle, Circle,
  Phone, Mail, MessageSquare
} from "lucide-react";
import { useLeadStore } from "@/lib/leads-store";

export default function QueryDetail() {
  const { queryId } = useParams({ from: "/_authenticated/query/$queryId" });
  const queries = useLeadStore((state) => state.queries);
  const data = queries.find(q => q.id === queryId);

  if (!data) {
    return <div className="p-6">Query not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{data.id} • {data.customer}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <Badge className="bg-green-100 text-green-700">{data.stage}</Badge>
              <span className="text-sm text-muted-foreground">{data.type}</span>
              <span className="text-sm text-muted-foreground">{data.destination}</span>
              <span className="text-sm text-muted-foreground">{data.dates}</span>
              <span className="text-sm text-muted-foreground">Owner: {data.owner}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm"><Share2 className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm"><MoreVertical className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-10 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requirement">Requirement</TabsTrigger>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="costing">Costing</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="commercials">Commercials</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-3 gap-6">
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Query Overview</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Travel Partner</p>
                  <p className="font-medium">{data.partner}</p>
                  <p className="text-sm">{data.contact}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3 w-3" /> {data.phone}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3 w-3" /> {data.email}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Market</p>
                  <p className="font-medium">{data.market}</p>
                  <p className="text-sm text-muted-foreground">Source</p>
                  <p>{data.source}</p>
                  <p className="text-sm text-muted-foreground">Lead ID</p>
                  <p>{data.leadId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Travel Dates</p>
                  <p className="font-medium">{data.travelDates}</p>
                  <p className="text-sm text-muted-foreground">Destination</p>
                  <p>{data.destination}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">No. of Travellers</p>
                  <p className="font-medium">{data.travellers}</p>
                  <p className="text-sm text-muted-foreground">Travel Type</p>
                  <p>{data.type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Assigned On</p>
                  <p>{data.assignedOn}</p>
                  <p className="text-sm text-muted-foreground">Current Stage</p>
                  <Badge className="bg-green-100 text-green-700">{data.stage}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Next Action</p>
                  <p>{data.nextAction}</p>
                  <p className="text-sm text-muted-foreground">Follow-up Due</p>
                  <p>{data.followUpDue}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lifecycle Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.timeline?.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-1">
                      {idx === data.timeline!.length - 1 ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.event}</p>
                      <p className="text-xs text-muted-foreground">{item.date}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Latest Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Latest Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.activities?.map((act, idx) => (
                <div key={idx} className="flex items-start gap-3 border-b pb-2 last:border-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm">{act.text}</p>
                    <p className="text-xs text-muted-foreground">{act.time} · {act.user}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Commercial Snapshot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commercial Snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Cost Price</p>
                  <p className="font-bold">{data.commercial?.costPrice}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Selling Price</p>
                  <p className="font-bold">{data.commercial?.sellingPrice}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Margin</p>
                  <p className="font-bold text-green-600">{data.commercial?.margin}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Agent Commission (10%)</p>
                  <p className="font-bold">{data.commercial?.commission}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net After Commission</p>
                  <p className="font-bold">{data.commercial?.netAfterCommission}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Progress value={16.55} className="w-full" />
                <span className="text-sm font-medium">16.55% Margin</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}