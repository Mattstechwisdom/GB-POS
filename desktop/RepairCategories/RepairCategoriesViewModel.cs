using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Data;
using System.Windows.Input;

namespace RepairCategories
{
    public class RepairCategoriesViewModel : INotifyPropertyChanged, IDataErrorInfo
    {
        private readonly IRepairsRepository _repo;

        public ObservableCollection<DeviceCategory> DeviceCategories { get; } = new ObservableCollection<DeviceCategory>();
        public ObservableCollection<RepairItem> Repairs { get; } = new ObservableCollection<RepairItem>();
        public ICollectionView RepairsView { get; }

        private DeviceCategory? _selectedDeviceCategory;
        public DeviceCategory? SelectedDeviceCategory { get => _selectedDeviceCategory; set { _selectedDeviceCategory = value; Raise(nameof(SelectedDeviceCategory)); RepairsView.Refresh(); } }

        private string _searchText = string.Empty;
        public string SearchText { get => _searchText; set { _searchText = value ?? string.Empty; Raise(nameof(SearchText)); RepairsView.Refresh(); } }

        private RepairItem? _selectedRepair;
        public RepairItem? SelectedRepair { get => _selectedRepair; set { _selectedRepair = value; Raise(nameof(SelectedRepair)); } }

        public bool ShowAllIgnoresDevice { get; set; } = true;

        public ICommand FindCommand { get; }
        public ICommand ShowAllCommand { get; }
        public ICommand SaveCommand { get; }
        public ICommand CancelCommand { get; }

        public RepairCategoriesViewModel(IRepairsRepository repo)
        {
            _repo = repo ?? throw new ArgumentNullException(nameof(repo));
            RepairsView = CollectionViewSource.GetDefaultView(Repairs);
            RepairsView.Filter = FilterPredicate;

            FindCommand = new RelayCommand(_ => RepairsView.Refresh());
            ShowAllCommand = new RelayCommand(_ => { SearchText = string.Empty; if (ShowAllIgnoresDevice) SelectedDeviceCategory = null; RepairsView.Refresh(); });
            SaveCommand = new RelayCommand(async _ => await SaveAsync(), _ => CanSave());
            CancelCommand = new RelayCommand(_ => Cancel());
        }

        private bool FilterPredicate(object obj)
        {
            if (!(obj is RepairItem item)) return false;
            if (SelectedDeviceCategory != null && !ShowAllIgnoresDevice)
            {
                if (item.DeviceCategory?.Id != SelectedDeviceCategory.Id) return false;
            }
            if (!string.IsNullOrWhiteSpace(SearchText))
            {
                var s = SearchText.ToLowerInvariant();
                if (!( (item.Name ?? string.Empty).ToLowerInvariant().Contains(s) || (item.AltDescription ?? string.Empty).ToLowerInvariant().Contains(s) || (item.ModelNumber ?? string.Empty).ToLowerInvariant().Contains(s) ))
                    return false;
            }
            return true;
        }

        public async Task LoadAsync()
        {
            var cats = await _repo.GetDeviceCategoriesAsync();
            DeviceCategories.Clear();
            foreach(var c in cats) DeviceCategories.Add(c);

            var r = await _repo.GetRepairsAsync();
            Repairs.Clear();
            foreach(var it in r) Repairs.Add(it);
            RepairsView.Refresh();
        }

        private bool CanSave()
        {
            if (SelectedRepair == null) return false;
            if (SelectedRepair.PartCost < 0 || SelectedRepair.LaborCost < 0) return false;
            if (!string.IsNullOrEmpty(SelectedRepair.OrderSourceUrl))
            {
                if (!Uri.IsWellFormedUriString(SelectedRepair.OrderSourceUrl, UriKind.Absolute)) return false;
            }
            return true;
        }

        private async Task SaveAsync()
        {
            if (!CanSave()) return;

            var selectedRepair = SelectedRepair;
            if (selectedRepair == null) return;

            await _repo.SaveAsync(selectedRepair);
            RepairsView.Refresh();
        }

        private void Cancel()
        {
            SelectedRepair?.CancelEdit();
            // optionally close window via messaging or callback
        }

        public string Error => string.Empty;
        public string this[string columnName]
        {
            get
            {
                if (SelectedRepair == null) return string.Empty;
                switch(columnName)
                {
                    case nameof(SelectedRepair.PartCost): return SelectedRepair.PartCost < 0 ? "Must be >= 0" : string.Empty;
                    case nameof(SelectedRepair.LaborCost): return SelectedRepair.LaborCost < 0 ? "Must be >= 0" : string.Empty;
                    case nameof(SelectedRepair.OrderSourceUrl):
                        return string.IsNullOrEmpty(SelectedRepair.OrderSourceUrl) || Uri.IsWellFormedUriString(SelectedRepair.OrderSourceUrl, UriKind.Absolute)
                            ? string.Empty
                            : "Invalid URL";
                }
                return string.Empty;
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        private void Raise(string p) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(p));
    }
}
