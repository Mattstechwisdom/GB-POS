using System;
using System.ComponentModel;

namespace RepairCategories
{
    public class RepairItem : INotifyPropertyChanged, IEditableObject
    {
        private RepairItem? _backupCopy;
        private bool _inEdit;

        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string ModelNumber { get; set; } = string.Empty;
        public string AltDescription { get; set; } = string.Empty;
        public decimal PartCost { get; set; }
        public decimal LaborCost { get; set; }
        public string PartSource { get; set; } = string.Empty;
        public string OrderSourceUrl { get; set; } = string.Empty;
        public DeviceCategory DeviceCategory { get; set; } = new DeviceCategory();

        public event PropertyChangedEventHandler? PropertyChanged;

        protected void Raise(string prop) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(prop));

        public void BeginEdit()
        {
            if (_inEdit) return;
            _backupCopy = (RepairItem)this.MemberwiseClone();
            _inEdit = true;
        }

        public void CancelEdit()
        {
            if (!_inEdit) return;
            if (_backupCopy == null)
            {
                _inEdit = false;
                return;
            }
            this.Id = _backupCopy.Id;
            this.Name = _backupCopy.Name;
            this.Type = _backupCopy.Type;
            this.ModelNumber = _backupCopy.ModelNumber;
            this.AltDescription = _backupCopy.AltDescription;
            this.PartCost = _backupCopy.PartCost;
            this.LaborCost = _backupCopy.LaborCost;
            this.PartSource = _backupCopy.PartSource;
            this.OrderSourceUrl = _backupCopy.OrderSourceUrl;
            this.DeviceCategory = _backupCopy.DeviceCategory;
            _inEdit = false;
        }

        public void EndEdit()
        {
            _backupCopy = null;
            _inEdit = false;
        }
    }
}
