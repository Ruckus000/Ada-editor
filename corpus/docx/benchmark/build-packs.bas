Attribute VB_Name = "BenchmarkPacks"
' Builds the engine benchmark's Word files, as registered in
' docs/audit/engine-benchmark-2026-10.md: the bad pack (rows 1-6, 8-29 and 31,
' planted once each), its good twin (the same text with every row fixed), and
' rows 7 and 30, which change the whole document, in files of their own.
' Word writes every byte. In Word: Tools > Macro > Visual Basic Editor, import
' this file (or paste it without the Attribute line), run BuildAll and give it
' the path to this folder. Row numbers below are the brief's.
Option Explicit

Private base As String
Private notDecorative As Long   ' images the Decorative property couldn't mark

Public Sub BuildAll()
    Dim detect As Boolean, failed As String
    base = InputBox("Full path to corpus/docx/benchmark/")
    If base = "" Then Exit Sub
    If Right(base, 1) <> "/" Then base = base & "/"
    If Not GrantAccessToMultipleFiles(Array(base, base & "images/")) Then Exit Sub
    ' No language guessed behind our back: rows 30 and 31 set it on purpose.
    On Error Resume Next
    detect = Application.CheckLanguage
    Application.CheckLanguage = False
    On Error GoTo restore
    BuildPack False, "benchmark-bad.docx"
    BuildPack True, "benchmark-good.docx"
    BuildTitleRow
    BuildLanguageRow
restore:
    If Err.Number <> 0 Then failed = Err.Description
    On Error Resume Next
    Application.CheckLanguage = detect
    If failed <> "" Then
        MsgBox "Stopped: " & failed
    Else
        MsgBox "Built 4 files. Images the macro couldn't mark decorative: " & notDecorative
    End If
End Sub

Private Sub BuildPack(good As Boolean, file As String)
    Dim d As Document, p As Range, after As Range, s As Shape, img As InlineShape
    Dim h As Hyperlink, row As Variant, i As Long
    Set d = Documents.Add
    d.BuiltInDocumentProperties("Title") = "Parks Board meeting, November 3, 2026"

    ' Row 10, F32: a word spelled out with spaces.
    Set p = Para(d, IIf(good, "Agenda", "A G E N D A"))
    p.ParagraphFormat.Alignment = wdAlignParagraphCenter
    Para d, "Parks Board meeting, November 3, 2026", wdStyleHeading1
    Para d, "Town of Example Parks Board. Town Hall, Room 2, at 6:00 pm."

    ' Row 4, F3: "draft" carried only by a watermark picture.
    Para d, "Status of this agenda", wdStyleHeading2
    If good Then
        Para d, "This agenda is a draft. The board will confirm it at the meeting."
    Else
        Para d, "The board will confirm this agenda at the meeting."
        Set s = d.Sections(1).Headers(wdHeaderFooterPrimary).Shapes.AddPicture( _
            FileName:=base & "images/draft.png", LinkToFile:=False, SaveWithDocument:=True)
        s.WrapFormat.Type = wdWrapBehind
        s.RelativeHorizontalPosition = wdRelativeHorizontalPositionPage
        s.RelativeVerticalPosition = wdRelativeVerticalPositionPage
        s.LockAspectRatio = msoTrue
        s.Width = 432
        s.Left = wdShapeCenter
        s.Top = wdShapeCenter
        s.AlternativeText = ""
    End If

    ' Row 12, F34: a table made with tabs.
    Para d, "Schedule", wdStyleHeading2
    If good Then
        Grid d, Array(Array("Time", "Item", "Presenter"), Array("6:00 pm", "Call to order", "Chair Lee"), _
            Array("6:05 pm", "Public comment", "Chair Lee"), Array("6:30 pm", "Trail lighting bid", "Director Ortiz")), True, True
    Else
        For Each row In Array("Time" & vbTab & "Item" & vbTab & "Presenter", _
                "6:00 pm" & vbTab & "Call to order" & vbTab & "Chair Lee", _
                "6:05 pm" & vbTab & "Public comment" & vbTab & "Chair Lee", _
                "6:30 pm" & vbTab & "Trail lighting bid" & vbTab & "Director Ortiz")
            Set p = Para(d, CStr(row))
            p.ParagraphFormat.TabStops.Add 72
            p.ParagraphFormat.TabStops.Add 252
        Next
    End If

    ' Row 15, F43: a label set in a heading style.
    Para d, "Roll call", wdStyleHeading2
    If good Then
        Para d, "Present: Chair Lee, Member Ortiz, Member Brown."
    Else
        Para d, "Present:", wdStyleHeading2
        Para d, "Chair Lee, Member Ortiz, Member Brown."
    End If

    ' Row 1, F1: in the bad pack this sentence is a text box floated up here,
    ' but stored after the next item's paragraph.
    Para d, "Public comment", wdStyleHeading2
    Para d, "Speakers sign up at the door before the meeting starts."
    If good Then Para d, "Each speaker has three minutes."

    ' Row 2, F2: a section title that is only bold and larger.
    If good Then
        Para d, "Old business", wdStyleHeading2
    Else
        Set p = Para(d, "Old business")
        p.Font.Bold = True
        p.Font.Size = 14
    End If
    Set after = Para(d, "The board will review the trail lighting bid.")
    If Not good Then
        Set s = d.Shapes.AddTextbox(msoTextOrientationHorizontal, 300, 0, 170, 40, after)
        s.TextFrame.TextRange.Text = "Each speaker has three minutes."
        s.RelativeHorizontalPosition = wdRelativeHorizontalPositionMargin
        s.RelativeVerticalPosition = wdRelativeVerticalPositionParagraph
        s.Left = 300
        s.Top = -90
        s.WrapFormat.Type = wdWrapSquare
    End If

    ' Row 6, F14: content found only by its location.
    Para d, "Volunteer sign-up", wdStyleHeading2
    Para d, IIf(good, "Sign up at the parks office or call 555-0100.", "Use the form on the right to sign up.")

    ' Row 3, F2: a list typed with bullets.
    Para d, "Consent agenda", wdStyleHeading2
    Para d, "The board approves these items together:"
    For Each row In Array("Park rental fees for 2027", "Minutes of October 6", "Donation of two benches")
        If good Then
            Para d, CStr(row), wdStyleListBullet
        Else
            Para d, ChrW(&H2022) & vbTab & CStr(row)
        End If
    Next

    ' Row 8, F26: a symbol alone carries the meaning.
    Para d, "Projects", wdStyleHeading2
    Para d, "Project approvals so far:"
    Grid d, Array(Array("Project", "Approved"), Array("Trail lighting", IIf(good, "Yes", ChrW(&H2713))), _
        Array("Pool repairs", IIf(good, "No", "")), Array("Dog park fence", IIf(good, "Yes", ChrW(&H2713)))), True, True

    ' Row 5, F13: alt text that leaves out what the chart shows.
    Para d, "Park visits", wdStyleHeading2
    Para d, "Park visits rose through the summer."
    AddPic d, "chart.png", IIf(good, "Bar chart of monthly park visits, March to October 2026. Visits rose from 900 in March " & _
        "to 2,300 in July, then fell to 1,100 in October.", "Chart"), 300

    ' Row 9, F30: a file name as alt text.
    Para d, "New playground", wdStyleHeading2
    Para d, "The new playground opens in December."
    AddPic d, "photo.png", IIf(good, "The site of the new playground at Riverside Park", "IMG_0412.jpg"), 300

    ' Row 19, F65: no alt text.
    Para d, "Riverside Park cleanup", wdStyleHeading2
    Para d, "Thanks to the 40 volunteers who cleaned the trail in October."
    AddPic d, "photo.png", IIf(good, "Riverside Park trail after the October cleanup", ""), 300

    ' Row 13, F38: a decorative picture, not marked decorative.
    Para d, "Announcements", wdStyleHeading2
    Para d, "The pool reopens on December 1."
    Set img = AddPic(d, "divider.png", "", 432)
    If good Then MarkDecorative img
    Para d, "The skating rink opens on December 15."

    ' Row 14, F39: alt text on a decorative picture.
    Para d, "Reports", wdStyleHeading2
    Para d, "The treasurer's report is attached."
    Set img = AddPic(d, "divider.png", IIf(good, "", "line"), 432)
    If good Then MarkDecorative img
    Para d, "The director's report follows."

    ' Row 11, F33: two columns made with tabs.
    Para d, "Park hours", wdStyleHeading2
    If good Then
        Para d, "Summer hours: Monday to Friday, 7 am to 9 pm; weekends, 8 am to 8 pm."
        Para d, "Winter hours: Monday to Friday, 8 am to 6 pm; weekends, 9 am to 5 pm."
    Else
        For Each row In Array("Summer hours" & vbTab & "Winter hours", _
                "Monday to Friday, 7 am to 9 pm" & vbTab & "Monday to Friday, 8 am to 6 pm", _
                "Weekends, 8 am to 8 pm" & vbTab & "Weekends, 9 am to 5 pm")
            Set p = Para(d, CStr(row))
            p.ParagraphFormat.TabStops.Add 252
        Next
    End If

    ' Row 16, F46: a layout table with a header row.
    Para d, "Contact", wdStyleHeading2
    Grid d, Array(Array("Town of Example Parks Department, 12 Main Street", "Call 555-0100 or write to parks@example.com."), _
        Array("Questions about this agenda go to the parks office.", "Large-print copies are available at the meeting.")), Not good, False

    ' Row 17, F49: a layout table that reads out of order, row by row.
    Para d, "Directions", wdStyleHeading2
    If good Then
        Para d, "From Main Street:"
        For Each row In Array("Take Main Street north.", "Turn left at Oak Avenue.", "Turn right into the Town Hall lot.", "Room 2 is past the front desk.")
            Para d, CStr(row), wdStyleListNumber
        Next
    Else
        Grid d, Array(Array("1. Take Main Street north.", "3. Turn right into the Town Hall lot."), _
            Array("2. Turn left at Oak Avenue.", "4. Room 2 is past the front desk.")), False, False
    End If

    ' Row 18, F63: link text that says nothing about where it goes.
    Para d, "Budget documents", wdStyleHeading2
    Set p = Para(d, IIf(good, "Read the 2027 parks budget.", "The budget documents are online. Click here."))
    d.Hyperlinks.Add Anchor:=Part(p, IIf(good, "Read the 2027 parks budget", "Click here")), Address:="https://example.com/budget"

    ' Row 20, F68: a form field with no name.
    Para d, "Speaker sign-up", wdStyleHeading2
    Set p = Para(d, "Name: ####")
    FieldAt d, p, 6, 4, IIf(good, "Speaker name", "")

    ' Row 21, F71: letters that only look like letters.
    Para d, IIf(good, "Notice", MathBold()), wdStyleHeading2
    Para d, "The pool closes for repairs on November 10."

    ' Row 22, F72: a seating plan drawn with characters.
    Para d, "Seating", wdStyleHeading2
    If good Then
        Para d, "The chair and the clerk sit at the front table. Public seats are in two rows of six facing them, " & _
            "and the door is at the back."
    Else
        For Each row In Array("        [ Chair ] [ Clerk ]", "   [ ] [ ] [ ] [ ] [ ] [ ]", "   [ ] [ ] [ ] [ ] [ ] [ ]", "            ^ door")
            Set p = Para(d, CStr(row))
            p.Font.Name = "Courier New"
        Next
    End If

    ' Row 23, F73: a link shown by colour alone.
    Para d, "Website", wdStyleHeading2
    Set p = Para(d, "Hours and maps are on the parks web page.")
    Set h = d.Hyperlinks.Add(Anchor:=Part(p, "parks web page"), Address:="https://example.com/parks")
    If Not good Then h.Range.Font.Underline = wdUnderlineNone

    ' Row 24, F81: items picked out by colour alone.
    Para d, "Votes", wdStyleHeading2
    Para d, IIf(good, "Items marked (vote) need a vote.", "Items in red need a vote.")
    For Each row In Array("Trail lighting bid|1", "Pool repair schedule|0", "Dog park hours|1")
        i = CLng(Split(CStr(row), "|")(1))
        Set p = Para(d, Split(CStr(row), "|")(0) & IIf(good And i = 1, " (vote)", ""), wdStyleListBullet)
        If Not good And i = 1 Then p.Font.Color = RGB(192, 0, 0)
    Next

    ' Row 25, F83: white text over a light photo.
    Para d, "Fall festival", wdStyleHeading2
    If good Then
        AddPic d, "photo.png", "Riverside Park in autumn", 300
        Para d, "Fall festival: October 31, 4 to 7 pm, at Riverside Park."
    Else
        Set p = Para(d, "Fall festival: October 31, 4 to 7 pm, at Riverside Park.")
        p.Font.Color = RGB(255, 255, 255)
        p.Font.Bold = True
        p.Font.Size = 20
        p.ParagraphFormat.SpaceBefore = 60
        p.ParagraphFormat.SpaceAfter = 170
        Set s = d.Shapes.AddPicture(FileName:=base & "images/photo.png", LinkToFile:=False, SaveWithDocument:=True, _
            Left:=0, Top:=0, Width:=360, Height:=240, Anchor:=p)
        s.WrapFormat.Type = wdWrapBehind
        s.RelativeHorizontalPosition = wdRelativeHorizontalPositionMargin
        s.RelativeVerticalPosition = wdRelativeVerticalPositionParagraph
        s.Left = 0
        s.Top = -50
        s.AlternativeText = "Riverside Park in autumn"
    End If

    ' Row 26, F86: one value split across fields, none named.
    Para d, "Rental contact", wdStyleHeading2
    If good Then
        Set p = Para(d, "Phone number: ####")
        FieldAt d, p, 14, 4, "Phone number"
    Else
        Set p = Para(d, "Phone: (###) ###-####")
        FieldAt d, p, 17, 4, ""
        FieldAt d, p, 13, 3, ""
        FieldAt d, p, 8, 3, ""
    End If

    ' Row 27, F89: a linked picture with no alt text.
    Para d, "Partners", wdStyleHeading2
    Para d, "Our partner for the fall festival:"
    Set img = AddPic(d, "logo.png", IIf(good, "Example Parks Foundation", ""), 72)
    d.Hyperlinks.Add Anchor:=img.Range, Address:="https://example.com/foundation"

    ' Row 28, F91: a data table whose header row isn't marked.
    Para d, "Fees", wdStyleHeading2
    Grid d, Array(Array("Fee", "Amount"), Array("Pavilion rental, half day", "$40"), _
        Array("Pavilion rental, full day", "$75"), Array("Field lights, per hour", "$15")), good, True

    ' Row 29, 1.4.3: grey text, 2.8:1 on white.
    Para d, "Parking", wdStyleHeading2
    Set p = Para(d, "Parking is free after 5 pm in the Town Hall lot.")
    If Not good Then p.Font.Color = RGB(153, 153, 153)

    ' Row 31, 3.1.2: a Spanish paragraph left in the document's language.
    Para d, "Language assistance", wdStyleHeading2
    Para d, "Language help is free."
    Set p = Para(d, Es("Si necesita ayuda en espa{n}ol, llame al 555-0100. Los servicios de idioma son gratuitos."))
    If good Then p.LanguageID = wdSpanishModernSort

    SaveAndClose d, file
End Sub

' Row 7, F25: no heading, and a Title property that says nothing.
Private Sub BuildTitleRow()
    Dim d As Document
    Set d = Documents.Add
    d.BuiltInDocumentProperties("Title") = "Document1"
    Para d, "The Parks Board will meet on November 3, 2026, at 6:00 pm in Town Hall, Room 2."
    Para d, "The agenda will be posted on October 30."
    Para d, "For questions, call the parks office at 555-0100."
    SaveAndClose d, "benchmark-row07-title.docx"
End Sub

' Row 30, 3.1.1: a Spanish document whose language is English (US).
Private Sub BuildLanguageRow()
    Dim d As Document
    Set d = Documents.Add
    d.BuiltInDocumentProperties("Title") = Es("Reuni{o}n de la Junta de Parques, 3 de noviembre de 2026")
    Para d, Es("Reuni{o}n de la Junta de Parques, 3 de noviembre de 2026"), wdStyleHeading1
    Para d, Es("La Junta de Parques se reunir{a} el 3 de noviembre de 2026 a las 6:00 pm en el Ayuntamiento, sala 2.")
    Para d, Es("La agenda estar{a} disponible el 30 de octubre. Si necesita ayuda, llame a la oficina de parques al 555-0100.")
    d.Content.LanguageID = wdEnglishUS
    SaveAndClose d, "benchmark-row30-language.docx"
End Sub

' Appends a paragraph in the given style and returns its text.
Private Function Para(d As Document, t As String, Optional st As Long = wdStyleNormal) As Range
    Dim r As Range
    Set r = d.Paragraphs.Last.Range
    If Len(r.Text) > 1 Then
        r.InsertParagraphAfter
        Set r = d.Paragraphs.Last.Range
    End If
    r.Style = d.Styles(st)
    r.Font.Reset
    r.InsertBefore t
    Set r = d.Paragraphs.Last.Range
    r.MoveEnd wdCharacter, -1
    Set Para = r
End Function

Private Function AddPic(d As Document, file As String, alt As String, w As Single) As InlineShape
    Set AddPic = d.InlineShapes.AddPicture(FileName:=base & "images/" & file, LinkToFile:=False, _
        SaveWithDocument:=True, Range:=Para(d, ""))
    AddPic.LockAspectRatio = msoTrue
    AddPic.Width = w
    AddPic.AlternativeText = alt
End Function

Private Function Grid(d As Document, rows As Variant, header As Boolean, ruled As Boolean) As Table
    Dim t As Table, i As Long, j As Long
    Set t = d.Tables.Add(Para(d, ""), UBound(rows) + 1, UBound(rows(0)) + 1)
    For i = 0 To UBound(rows)
        For j = 0 To UBound(rows(0))
            t.Cell(i + 1, j + 1).Range.Text = rows(i)(j)
        Next
    Next
    t.Borders.Enable = ruled
    ' Both of Word's header-row switches: the table style's and "Repeat as header row".
    t.ApplyStyleHeadingRows = header
    t.Rows(1).HeadingFormat = header
    Set Grid = t
End Function

' The part of a paragraph that reads s.
Private Function Part(p As Range, s As String) As Range
    Dim i As Long
    i = InStr(p.Text, s)
    If i = 0 Then Err.Raise 5, , "Not in the paragraph: " & s
    Set Part = p.Document.Range(p.Start + i - 1, p.Start + i - 1 + Len(s))
End Function

' Turns characters at+1 .. at+n of a paragraph into an empty text field.
Private Sub FieldAt(d As Document, p As Range, at As Long, n As Long, title As String)
    Dim cc As ContentControl
    Set cc = d.ContentControls.Add(wdContentControlText, d.Range(p.Start + at, p.Start + at + n))
    If title <> "" Then cc.Title = title
    cc.Range.Text = ""
End Sub

Private Sub MarkDecorative(img As InlineShape)
    On Error Resume Next
    CallByName img, "Decorative", VbLet, True
    If Err.Number <> 0 Then notDecorative = notDecorative + 1
    Err.Clear
End Sub

' "NOTICE" in mathematical bold capitals (U+1D40D and on).
Private Function MathBold() As String
    Dim c As Variant
    For Each c In Array(&HDC0D, &HDC0E, &HDC13, &HDC08, &HDC02, &HDC04)
        MathBold = MathBold & ChrW(&HD835) & ChrW(c)
    Next
End Function

' Accented letters by code, so the macro survives any editor's encoding.
Private Function Es(s As String) As String
    Es = Replace(Replace(Replace(s, "{n}", ChrW(241)), "{o}", ChrW(243)), "{a}", ChrW(225))
End Function

Private Sub SaveAndClose(d As Document, file As String)
    d.BuiltInDocumentProperties("Company") = ""
    ' No author or last editor in docProps: Word strips them on save.
    d.RemovePersonalInformation = True
    d.SaveAs2 FileName:=base & file, FileFormat:=wdFormatXMLDocument
    d.Close SaveChanges:=False
End Sub
