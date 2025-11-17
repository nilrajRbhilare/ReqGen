import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, FileText, Eye, Upload, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useNotifications } from "@/contexts/NotificationContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DocumentPreview } from "@/components/document-preview";
import type { InsertDocument, Settings } from "@shared/schema";

export default function NoteEditor() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const [companyName, setCompanyName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [originalNote, setOriginalNote] = useState("");
  const [refinedNote, setRefinedNote] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [docType, setDocType] = useState("");
  const [highlightField, setHighlightField] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"choice" | "type">("choice");
  const [isUploading, setIsUploading] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);

  const documentNameRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const docTypeRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load editing document from localStorage on mount
  useEffect(() => {
    const editingDocData = localStorage.getItem('editingDocument');
    if (editingDocData) {
      try {
        const docData = JSON.parse(editingDocData);
        setEditingDocumentId(docData.id);
        setProjectName(docData.name);
        setCompanyName(docData.companyName);
        setOriginalNote(docData.content);
        setDocType(docData.type);
        setInputMode("type"); // Switch to type mode to show the content
        // Clear from localStorage after loading
        localStorage.removeItem('editingDocument');
        
        toast({
          title: "Editing Document",
          description: "Document loaded for editing. Update and save your changes.",
        });
      } catch (error) {
        console.error("Failed to load editing document:", error);
      }
    }
  }, [toast]);

  // ESC key handler to go back to choice screen
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && inputMode === "type") {
        setInputMode("choice");
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [inputMode]);

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const focusField = (fieldType: 'documentName' | 'content' | 'docType') => {
    let ref;
    if (fieldType === 'documentName') ref = documentNameRef;
    else if (fieldType === 'content') ref = contentRef;
    else if (fieldType === 'docType') ref = docTypeRef;

    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        ref.current?.focus();
      }, 300);
      setHighlightField(fieldType);
      setTimeout(() => {
        setHighlightField(null);
      }, 2000);
    }
  };

  const handleFileUpload = async (file: File) => {
    console.log("Starting file upload:", file.name, "Size:", file.size, "Type:", file.type);
    setIsUploading(true);
    
    // Switch to type mode immediately to show loading state
    setInputMode("type");
    
    try {
      const fileType = file.name.split('.').pop()?.toLowerCase();
      console.log("File extension:", fileType);
      let text = '';

      if (fileType === 'txt') {
        console.log("Processing .txt file");
        text = await file.text();
        console.log("Extracted text length:", text.length);
      } else if (fileType === 'docx') {
        console.log("Processing .docx file");
        try {
          const mammoth = await import('mammoth');
          const arrayBuffer = await file.arrayBuffer();
          console.log("ArrayBuffer size:", arrayBuffer.byteLength);
          
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value;
          console.log("Extracted text length:", text.length);
          
          if (result.messages && result.messages.length > 0) {
            console.log("Mammoth messages:", result.messages);
          }

          if (!text || text.trim().length === 0) {
            console.warn("No text extracted from DOCX, trying alternative method...");
            const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlResult.value;
            text = tempDiv.textContent || tempDiv.innerText || '';
            console.log("Alternative extraction - text length:", text.length);
          }
        } catch (docxError) {
          console.error("DOCX processing error:", docxError);
          toast({
            title: "DOCX Processing Error",
            description: "Could not read the .docx file. It may be corrupted or password-protected. Try saving it again or converting to .txt",
            variant: "destructive",
          });
          return;
        }
      } else if (fileType === 'pdf') {
        console.log("Processing .pdf file");
        try {
          const pdfjsLib = await import('pdfjs-dist');
          
          // Use Vite's ?url syntax to import the worker properly
          const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default;
            console.log("PDF.js worker configured:", workerUrl.default);
          }
          
          const arrayBuffer = await file.arrayBuffer();
          console.log("Loading PDF document...");
          
          const loadingTask = pdfjsLib.getDocument({ 
            data: arrayBuffer,
            verbosity: 0 // Suppress warnings
          });
          
          const pdf = await loadingTask.promise;
          console.log("PDF loaded successfully, pages:", pdf.numPages);
          
          let fullText = '';
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          
          text = fullText;
          console.log("Extracted PDF text length:", text.length);
        } catch (pdfError: any) {
          console.error("PDF processing error:", pdfError);
          const errorMessage = pdfError?.message || "Unknown error";
          console.error("PDF error details:", errorMessage);
          
          toast({
            title: "PDF Processing Error",
            description: `Could not read the PDF file. ${errorMessage.includes('password') ? 'The file appears to be password-protected.' : 'It may be password-protected, image-based, or corrupted.'} Try a different file.`,
            variant: "destructive",
          });
          return;
        }
      } else if (fileType === 'doc') {
        console.log("Unsupported .doc format");
        toast({
          title: "Unsupported Format",
          description: "Please convert .doc files to .docx, .pdf, or .txt format",
          variant: "destructive",
        });
        return;
      } else {
        console.log("Unsupported file type:", fileType);
        toast({
          title: "Unsupported Format",
          description: "Please upload .txt, .docx, or .pdf files",
          variant: "destructive",
        });
        return;
      }

      if (!text || text.trim().length === 0) {
        console.warn("Extracted text is empty");
        toast({
          title: "Empty File",
          description: "No readable text found in the file. The file may be empty, image-based, or corrupted.",
          variant: "destructive",
        });
        return;
      }

      console.log("Setting originalNote with text:", text.substring(0, 100) + "...");
      setOriginalNote(text);
      
      toast({
        title: "File Uploaded Successfully",
        description: `Loaded ${text.length} characters from ${file.name}`,
      });
      addNotification("Document Uploaded", `Content loaded from ${file.name}`);
      
      console.log("File upload completed successfully");
    } catch (error) {
      console.error("File upload error details:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error message:", errorMessage);
      
      toast({
        title: "Upload Failed",
        description: `Failed to read file: ${errorMessage}. Please try again with a different file.`,
        variant: "destructive",
      });
      
      // Go back to choice screen on error
      setInputMode("choice");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
      // Reset the input so the same file can be uploaded again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const saveDocumentMutation = useMutation({
    mutationFn: async (data: InsertDocument) => {
      // If editing existing document, use PATCH to update
      if (editingDocumentId) {
        const response = await apiRequest("PATCH", `/api/documents/${editingDocumentId}`, data);
        return response.json();
      }
      // Otherwise create new document
      const response = await apiRequest("POST", "/api/documents", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      
      if (editingDocumentId) {
        addNotification("Document Updated", `Your ${docType.toUpperCase()} document has been updated successfully`);
        toast({
          title: "Success",
          description: "Document updated successfully!",
        });
      } else {
        addNotification("Document Generated", `Your ${docType.toUpperCase()} document has been created successfully`);
        toast({
          title: "Success",
          description: "Document saved successfully!",
        });
      }
      
      setShowPreview(false);
      setCompanyName("");
      setProjectName("");
      setOriginalNote("");
      setRefinedNote("");
      setDocType("");
      setInputMode("choice");
      setEditingDocumentId(null);
      setLocation("/files");
    },
    onError: () => {
      toast({
        title: "Error",
        description: editingDocumentId ? "Failed to update document. Please try again." : "Failed to save document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRefine = async () => {
    console.log("handleRefine called");
    console.log("originalNote state:", originalNote);
    console.log("originalNote length:", originalNote?.length || 0);
    console.log("isRefining:", isRefining);
    
    if (!originalNote || originalNote.trim().length === 0) {
      console.warn("Cannot refine: originalNote is empty");
      toast({
        title: "No Content",
        description: "Please add some content before refining with AI",
        variant: "destructive",
      });
      return;
    }
    
    setIsRefining(true);
    console.log("Starting AI refinement...");
    
    setTimeout(() => {
      const refined = `REFINED VERSION:\n\n${originalNote}\n\nAdditional Context:\n- Clear objectives defined\n- Stakeholder requirements documented\n- Success criteria established\n- Timeline considerations included`;
      console.log("Setting refined note, length:", refined.length);
      setRefinedNote(refined);
      addNotification("AI Refinement Complete", "Your notes have been refined successfully");
      setIsRefining(false);
      console.log("AI refinement completed");
    }, 2000);
  };

  const handleGenerateDocument = () => {
    if (!projectName.trim()) {
      focusField('documentName');
      toast({
        title: "Document Name Required",
        description: "Please enter a document name to continue",
        variant: "destructive",
      });
      return;
    }

    if (!originalNote && !refinedNote) {
      focusField('content');
      toast({
        title: "Content Required",
        description: "Please write your note before generating document",
        variant: "destructive",
      });
      return;
    }

    if (!docType) {
      focusField('docType');
      toast({
        title: "Document Type Required",
        description: "Please select a document type",
        variant: "destructive",
      });
      return;
    }

    console.log("Generating document:", { type: docType, content: refinedNote || originalNote });
    setShowPreview(true);
  };

  const handleConfirmGenerate = async () => {
    const content = refinedNote || originalNote;
    const getDocTypeName = (type: string) => {
      switch (type) {
        case "brd":
          return "Business Requirement Document";
        case "srs":
          return "Software Requirement Specification";
        case "sdd":
          return "System Design Document";
        case "po":
          return "Purchase Order";
        default:
          return "Document";
      }
    };
    const docTypeName = getDocTypeName(docType);
    const timestamp = new Date().toISOString().split('T')[0];
    
    const documentName = projectName.trim() || `${docTypeName} - ${timestamp}`;
    
    await saveDocumentMutation.mutateAsync({
      name: documentName,
      type: docType,
      content,
      originalNote,
      refinedNote: refinedNote || null,
      companyName: companyName || null,
      projectName: projectName || null,
      status: "pending" as const,
      clientMessage: null,
    });
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 bg-gradient-to-br from-primary/5 via-background to-accent/5 min-h-full">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Note Editor
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2">
          Write your requirements and refine them with AI before generating documents
        </p>
      </div>

      <Card className="shadow-lg border-2">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
          <CardTitle className="text-lg md:text-xl">Document Information</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                placeholder="Enter company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-name">Document Name</Label>
              <Input
                ref={documentNameRef}
                id="project-name"
                placeholder="Enter document name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={highlightField === 'documentName' ? 'ring-2 ring-destructive animate-pulse' : ''}
                data-testid="input-project-name"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card className="shadow-lg border-2">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
            <CardTitle className="text-xl">Your Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Your Notes</Label>

              {inputMode === "choice" ? (
                <div className="min-h-[250px] border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-4 md:gap-6 p-4 md:p-8">
                  <p className="text-xs md:text-sm text-muted-foreground text-center px-2">
                    Choose how you want to add your requirements
                  </p>
                  <div className="flex flex-col gap-3 md:gap-4 w-full max-w-sm">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setInputMode("type")}
                      className="w-full h-24 md:h-28 flex flex-col gap-2 md:gap-3 hover-elevate"
                      data-testid="button-choose-type"
                    >
                      <Type className="w-8 h-8 md:w-10 md:h-10" />
                      <div className="text-center">
                        <p className="text-sm md:text-base font-semibold">Type or Paste</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Write your notes manually
                        </p>
                      </div>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-24 md:h-28 flex flex-col gap-2 md:gap-3 hover-elevate"
                      data-testid="button-choose-upload"
                    >
                      <Upload className="w-8 h-8 md:w-10 md:h-10" />
                      <div className="text-center">
                        <p className="text-sm md:text-base font-semibold">Upload Document</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Import from .txt, .docx, or .pdf
                        </p>
                      </div>
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.docx,.pdf"
                      onChange={handleFileInputChange}
                      className="hidden"
                      data-testid="input-file-upload-main"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {isUploading ? (
                    <div className="min-h-[250px] border rounded-md p-4 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/5 flex flex-col items-center justify-center gap-4">
                      <div className="w-full max-w-md space-y-4">
                        <div className="flex items-center justify-center gap-2 text-primary">
                          <Upload className="w-6 h-6 animate-bounce" />
                          <span className="text-lg font-semibold">Processing Document...</span>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]" />
                          </div>
                          
                          <div className="space-y-2">
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-3/4" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-full" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-5/6" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-2/3" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-4/5" />
                          </div>
                        </div>
                        
                        <p className="text-center text-sm text-muted-foreground animate-pulse">
                          Extracting and loading content...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Textarea
                      ref={contentRef}
                      placeholder="Start writing your business requirements here...&#10;&#10;Example:&#10;- Project objective&#10;- Key stakeholders&#10;- Main features required&#10;- Timeline and budget constraints&#10;&#10;Press ESC to go back"
                      className={`min-h-[250px] resize-none ${highlightField === 'content' ? 'ring-2 ring-destructive animate-pulse' : ''}`}
                      value={originalNote}
                      onChange={(e) => setOriginalNote(e.target.value)}
                      data-testid="textarea-original-note"
                      autoFocus
                    />
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setInputMode("choice")}
                      className="text-xs"
                      data-testid="button-back-to-choice"
                      disabled={isUploading}
                    >
                      ← Back to options
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <Button
              onClick={() => {
                console.log("Refine button clicked");
                console.log("Button state - originalNote:", !!originalNote, "isRefining:", isRefining);
                handleRefine();
              }}
              disabled={!originalNote || isRefining}
              className="w-full gap-2 shadow-lg bg-gradient-to-r from-accent to-primary hover:shadow-xl transition-all"
              data-testid="button-refine-ai"
            >
              <Sparkles className="w-4 h-4" />
              {isRefining ? "Refining..." : "Refine with AI"}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-2">
          <CardHeader className="bg-gradient-to-r from-accent/10 to-transparent">
            <CardTitle className="text-xl">Refined Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>AI-Refined Version</Label>
              <Textarea
                placeholder="AI-refined version will appear here..."
                className="min-h-[250px] resize-none"
                value={refinedNote}
                onChange={(e) => setRefinedNote(e.target.value)}
                data-testid="textarea-refined-note"
              />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger 
                    ref={docTypeRef}
                    className={highlightField === 'docType' ? 'ring-2 ring-destructive animate-pulse' : ''}
                    data-testid="select-document-type"
                  >
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brd">Business Requirement Document (BRD)</SelectItem>
                    <SelectItem value="srs">Software Requirement Specification (SRS)</SelectItem>
                    <SelectItem value="sdd">System Design Document (SDD)</SelectItem>
                    <SelectItem value="po">Purchase Order (PO)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleGenerateDocument}
                className="w-full gap-2 shadow-lg bg-gradient-to-r from-primary to-accent hover:shadow-xl transition-all"
                data-testid="button-generate-document"
              >
                <FileText className="w-4 h-4" />
                Generate Document
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Document Preview
            </DialogTitle>
            <DialogDescription>
              Review your document before saving
            </DialogDescription>
          </DialogHeader>
          <DocumentPreview
            docType={docType}
            content={refinedNote || originalNote}
            companyName={companyName}
            projectName={projectName}
            generatedAt={new Date()}
            settings={settings}
          />
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowPreview(false)} 
              disabled={saveDocumentMutation.isPending}
              data-testid="button-cancel-preview"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmGenerate} 
              disabled={saveDocumentMutation.isPending}
              data-testid="button-confirm-save"
            >
              {saveDocumentMutation.isPending ? "Saving..." : "Confirm & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
