import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useLeadStore } from "@/lib/leads-store";

const stageColors: Record<string, string> = {
  New: "bg-blue-100 text-blue-700",
  "Requirement Review": "bg-purple-100 text-purple-700",
  Costing: "bg-yellow-100 text-yellow-700",
  "Quotation Sent": "bg-green-100 text-green-700",
  Followup: "bg-orange-100 text-orange-700",
  Nurturing: "bg-gray-100 text-gray-700",
};

export default function QueryTracker() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const queries = useLeadStore((state) => state.queries);

  const filteredQueries = queries.filter(
    (q) =>
      q.id.toLowerCase().includes(search.toLowerCase()) ||
      q.customer.toLowerCase().includes(search.toLowerCase()) ||
      q.destination.toLowerCase().includes(search.toLowerCase())
  );

  const handleRowClick = (queryId: string) => {
    navigate({
      to: "/query/$queryId",
      params: { queryId },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Query Tracker</h1>
        <p className="text-sm text-muted-foreground">Track and manage all queries and their progress</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assigned Queries</p>
                <p className="text-2xl font-bold">{queries.length}</p>
              </div>
              <Badge variant="secondary">Active</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sent Today</p>
                <p className="text-2xl font-bold">52</p>
              </div>
              <Badge variant="secondary">Quotes</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Follow-ups Due</p>
                <p className="text-2xl font-bold">36</p>
              </div>
              <Badge variant="secondary">Today</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">21</p>
              </div>
              <Badge variant="destructive">Action Required</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Query ID, Customer, or Destination..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          Filter
        </Button>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query ID</TableHead>
                <TableHead>Travel Dates</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Travel Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Query Owner</TableHead>
                <TableHead>Query Value</TableHead>
                <TableHead>Next Action</TableHead>
                <TableHead>Follow-up Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQueries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No queries found. Create a new lead to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredQueries.map((q) => (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleRowClick(q.id)}
                  >
                    <TableCell className="font-medium text-blue-600">{q.id}</TableCell>
                    <TableCell>{q.dates}</TableCell>
                    <TableCell>{q.destination}</TableCell>
                    <TableCell>{q.type}</TableCell>
                    <TableCell>{q.customer}</TableCell>
                    <TableCell>
                      <Badge className={stageColors[q.stage] || "bg-gray-100"}>{q.stage}</Badge>
                    </TableCell>
                    <TableCell>{q.owner}</TableCell>
                    <TableCell className="font-medium">{q.value}</TableCell>
                    <TableCell>{q.action}</TableCell>
                    <TableCell>{q.due}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Showing 1 to {filteredQueries.length} of {queries.length} entries</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="bg-primary text-primary-foreground">
            1
          </Button>
          <Button variant="outline" size="sm">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}